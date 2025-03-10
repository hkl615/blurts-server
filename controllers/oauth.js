"use strict";
const { URL } = require("url");

const crypto = require("crypto");

const AppConstants = require("../app-constants");
const DB = require("../db/DB");
const EmailUtils = require("../email-utils");
const { FXA, FxAOAuthClient } = require("../lib/fxa");
const { FluentError } = require("../locale-utils");
const HIBP = require("../hibp");
const mozlog = require("../log");
const sha1 = require("../sha1-utils");

//DATA REMOVAL SPECIFIC
const { REMOVAL_CONSTANTS } = require("../removal-constants");
const { checkIfOnRemovalPilotList } = require("./user");
//END DATA REMOVAL SPECIFIC

const log = mozlog("controllers.oauth");

function init(req, res, next, client = FxAOAuthClient) {
  // Set a random state string in a cookie so that we can verify
  // the user when they're redirected back to us after auth.
  const state = crypto.randomBytes(40).toString("hex");
  req.session.state = state;
  const url = new URL(client.code.getUri({ state }));
  const fxaParams = new URL(req.url, AppConstants.SERVER_URL);

  req.session.utmContents = {};

  url.searchParams.append("access_type", "offline");
  url.searchParams.append("action", "email");

  for (const param of fxaParams.searchParams.keys()) {
    url.searchParams.append(param, fxaParams.searchParams.get(param));
  }
  res.redirect(url);
}

async function confirmed(req, res, next, client = FxAOAuthClient) {
  if (!req.session.state) {
    throw new FluentError("oauth-invalid-session");
  }

  if (req.session.state !== req.query.state) {
    throw new FluentError("oauth-invalid-session");
  }

  const fxaUser = await client.code.getToken(req.originalUrl, {
    state: req.session.state,
  });
  // Clear the session.state to clean up and avoid any replays
  req.session.state = null;
  log.debug("fxa-confirmed-fxaUser", fxaUser);
  const fxaProfileData = await FXA.getProfileData(fxaUser.accessToken);
  log.debug("fxa-confirmed-profile-data", fxaProfileData);
  const email = JSON.parse(fxaProfileData).email;

  const existingUser = await DB.getSubscriberByEmail(email);
  req.session.user = existingUser;

  //const returnURL = new URL("/user/dashboard", AppConstants.SERVER_URL); //MH TODO: Current prod monitor code. Enable this if not using the conditional pilot redirect below

  //DATA REMOVAL SPECIFIC
  const post_auth_redirect = req.session.post_auth_redirect;
  let returnURL;
  const isOnRemovalPilotList = await checkIfOnRemovalPilotList(existingUser);
  if (isOnRemovalPilotList) {
    req.session.kanary = { onRemovalPilotList: true };
  }

  if (existingUser && isOnRemovalPilotList) {
    //if they are an existing user and on the pilot list, use pilot redirect
    if (post_auth_redirect) {
      returnURL = new URL(post_auth_redirect, AppConstants.SERVER_URL);
      req.session.post_auth_redirect = null;
    } else {
      returnURL = new URL(
        REMOVAL_CONSTANTS.REMOVE_LOGGED_IN_DEFAULT_ROUTE,
        AppConstants.SERVER_URL
      );
    }
  } else {
    //return standard monitor post auth redirect
    returnURL = new URL("/user/dashboard", AppConstants.SERVER_URL);
  }
  //END DATA REMOVAL SPECIFIC

  // Check if user is signing up or signing in,
  // then add new users to db and send email.
  if (!existingUser || existingUser.fxa_refresh_token === null) {
    // req.session.newUser determines whether or not we show "fxa_new_user_bar" in template
    req.session.newUser = true;
    const signupLanguage = req.headers["accept-language"];
    const verifiedSubscriber = await DB.addSubscriber(
      email,
      signupLanguage,
      fxaUser.accessToken,
      fxaUser.refreshToken,
      fxaProfileData
    );

    // duping some of user/verify for now
    let unsafeBreachesForEmail = [];

    unsafeBreachesForEmail = await HIBP.getBreachesForEmail(
      sha1(email),
      req.app.locals.breaches,
      true
    );

    const utmID = "report";

    const reportSubject = EmailUtils.getReportSubject(
      unsafeBreachesForEmail,
      req
    );

    await EmailUtils.sendEmail(email, reportSubject, "default_email", {
      supportedLocales: req.supportedLocales,
      breachedEmail: email,
      recipientEmail: email,
      date: req.fluentFormat(new Date()),
      unsafeBreachesForEmail: unsafeBreachesForEmail,
      ctaHref: EmailUtils.getEmailCtaHref(utmID, "go-to-dashboard-link"),
      unsubscribeUrl: EmailUtils.getUnsubscribeUrl(verifiedSubscriber, utmID),
      whichPartial: "email_partials/report",
    });

    req.session.user = verifiedSubscriber;
    return res.redirect(returnURL.pathname + returnURL.search);
  }
  // Update existing user's FxA data
  await DB._updateFxAData(
    existingUser,
    fxaUser.accessToken,
    fxaUser.refreshToken,
    fxaProfileData
  );
  res.redirect(returnURL.pathname + returnURL.search);
}

module.exports = {
  init,
  confirmed,
};
