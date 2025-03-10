"use strict";

const { LocaleUtils } = require("./../locale-utils");
const { makeBreachCards } = require("./breaches");

//DATA REMOVAL SPECIFIC
const { sentenceCase } = require("./hbs-helpers");
const { FormUtils } = require("./../form-utils");
const { REMOVAL_CONSTANTS, REMOVAL_STATUS } = require("./../removal-constants");

function enLocaleIsSupported(args) {
  return args.data.root.req.headers["accept-language"].includes("en");
}

function getBreachesDashboard(args) {
  const verifiedEmails = args.data.root.verifiedEmails;
  const locales = args.data.root.req.supportedLocales;
  let breachesFound = false;

  // move emails with 0 breaches to the bottom of the page
  verifiedEmails.sort((a, b) => {
    if (
      (a.breaches.length === 0 && b.breaches.length > 0) ||
      (b.breaches.length === 0 && a.breaches.length > 0)
    ) {
      return b.breaches.length - a.breaches.length;
    }
    return 0;
  });

  verifiedEmails.forEach((email) => {
    const breachCards = makeBreachCards(email.breaches, locales);

    if (!breachesFound && breachCards.length > 0) {
      breachesFound = true;
    }

    email.numBreaches = breachCards.length;
    email.numResolvedBreaches = 0;
    email.numUnresolvedBreaches = 0;

    // Get the number of resolved breaches for email
    email.breaches.forEach((breach) => {
      if (breach.IsResolved) {
        email.numResolvedBreaches++;
      }
    });

    // Move resolved breaches to the end of breach list
    if (email.numResolvedBreaches > 0) {
      breachCards.sort((a, b) => {
        if (a.IsResolved && !b.IsResolved) {
          return 1;
        }
        if (!a.IsResolved && b.IsResolved) {
          return -1;
        }
      });
    }
    delete email.breaches;
    email.numUnresolvedBreaches = email.numBreaches - email.numResolvedBreaches;
    email.foundBreaches = {};

    // If there are more than four unresolved breaches, show only the first four by default.
    if (email.numUnresolvedBreaches > 4) {
      email.foundBreaches.breachesShownByDefault = breachCards.slice(0, 4);
      email.foundBreaches.remainingBreaches = breachCards.slice(
        4,
        breachCards.length
      );
    } else {
      email.foundBreaches.breachesShownByDefault = breachCards;
    }
  });
  const emailCards = {
    verifiedEmails: verifiedEmails,
    breachesFound: breachesFound,
  };

  return args.fn(emailCards);
}

function welcomeMessage(args) {
  const locales = args.data.root.req.supportedLocales;
  const userEmail = args.data.root.req.session.user.fxa_profile_json.email;
  const newUser = args.data.root.req.session.newUser;

  if (newUser) {
    return LocaleUtils.fluentFormat(locales, "welcome-user", {
      userName: userEmail,
    });
  }

  return LocaleUtils.fluentFormat(locales, "welcome-back", {
    userName: userEmail,
  });
}

function makeEmailAddedToSubscriptionString(email, args) {
  const locales = args.data.root.req.supportedLocales;
  const nestedEmail = `<span class="bold">${email}</span>`;
  return LocaleUtils.fluentFormat(locales, "email-added-to-subscription", {
    email: nestedEmail,
  });
}

function makeEmailVerifiedString(args) {
  const locales = args.data.root.req.supportedLocales;
  let nestedSignInLink = LocaleUtils.fluentFormat(
    locales,
    "sign-in-nested",
    {}
  );
  nestedSignInLink = `<a class="text-link bold blue-link" href="/oauth/init">${nestedSignInLink}</a>`;

  return LocaleUtils.fluentFormat(locales, "email-verified-view-dashboard", {
    nestedSignInLink: nestedSignInLink,
  });
}

function getUserPreferences(args) {
  const csrfToken = args.data.root.csrfToken;
  const unverifiedEmails = args.data.root.unverifiedEmails;
  const verifiedEmails = args.data.root.verifiedEmails;
  const sessionUser = args.data.root.req.session.user;
  const communicationOption = sessionUser.all_emails_to_primary ? 1 : 0;

  const locales = args.data.root.req.supportedLocales;
  args.data.root.preferences = true;

  verifiedEmails.forEach((email) => {
    email.numBreaches = email.breaches.length;
    delete email.breaches;
  });

  const primaryEmail = verifiedEmails.shift();

  const emailAddresses = {
    primary: {
      subhead: LocaleUtils.fluentFormat(locales, "fxa-primary-email"),
      className: "fxa-primary-email",
      email_addresses: [primaryEmail], // put in array for template looping
    },
    secondary: {
      subhead: LocaleUtils.fluentFormat(locales, "other-monitored-emails"),
      className: "other-monitored-emails",
      email_addresses: verifiedEmails,
    },
    unverified: {
      subhead: LocaleUtils.fluentFormat(locales, "email-verification-required"),
      className: "email-verification-required",
      email_addresses: unverifiedEmails,
    },
    total:
      [primaryEmail].length + verifiedEmails.length + unverifiedEmails.length,
  };

  const communicationOptions = [
    {
      optionDescription: "Send breach alerts to the affected email address.",
      labelString: LocaleUtils.fluentFormat(locales, "to-affected-email"),
      optionId: "0",
      optionChecked: communicationOption === 0 ? "checked" : "",
    },
    {
      optionDescription:
        "Send all breach alerts to subscriber's primary email address.",
      labelString: LocaleUtils.fluentFormat(locales, "comm-opt-1", {
        primaryEmail: `<span class="bold">${primaryEmail.email}</span>`,
      }),
      optionId: "1",
      optionChecked: communicationOption === 1 ? "checked" : "",
    },
  ];

  const user = {
    primaryEmail: primaryEmail.email,
    emails: emailAddresses,
    communicationOptions: communicationOptions,
    csrfToken: csrfToken,
  };
  return args.fn(user);
}

function getLastAddedEmailStrings(args) {
  const locales = args.data.root.req.supportedLocales;
  const lastAddedEmail = args.data.root.lastAddedEmail;
  const lastAddedEmailSpan = `<span class="bold">${lastAddedEmail}</span>`;

  const preferencesLinkString = LocaleUtils.fluentFormat(
    locales,
    "preferences"
  );
  const preferencesLink = `<a class="demi text-link" href="/user/preferences">${preferencesLinkString}</a>`;

  const lastAddedEmailStrings = [
    LocaleUtils.fluentFormat(locales, "verify-the-link", {
      userEmail: lastAddedEmailSpan,
    }),
    LocaleUtils.fluentFormat(locales, "manage-all-emails", { preferencesLink }),
  ];
  return lastAddedEmailStrings;
}

//DATA REMOVAL SPECIFIC

function getRemoveFormData(args) {
  const countries = args.data.root.countries;
  const usStates = args.data.root.usStates;
  const verifiedEmails = args.data.root.verifiedEmails;
  const acctInfo = args.data.root.removeAcctInfo;
  const csrfToken = args.data.root.csrfToken;
  const doClientsideValidation = args.data.root.doClientsideValidation;
  const allowEditRemovalInfo = args.data.root.allowEditRemovalInfo;

  // move emails with 0 breaches to the bottom of the page
  verifiedEmails.sort((a, b) => {
    if (
      (a.breaches.length === 0 && b.breaches.length > 0) ||
      (b.breaches.length === 0 && a.breaches.length > 0)
    ) {
      return b.breaches.length - a.breaches.length;
    }
    return 0;
  });

  if (acctInfo && acctInfo.emails && acctInfo.emails.length) {
    //set a default email if available
    verifiedEmails.forEach((email) => {
      if (email.email === acctInfo.emails[0].email) {
        email.isSelected = true;
      }
    });
  }

  const emailCards = {
    csrfToken: csrfToken,
    verifiedEmails: verifiedEmails,
    countries: countries,
    usStates: usStates,
    acctInfo: acctInfo,
    jsConstants: REMOVAL_CONSTANTS,
    doClientsideValidation: doClientsideValidation,
    allowEditRemovalInfo: allowEditRemovalInfo,
  };

  return args.fn(emailCards);
}

function getRemovalSitesList(args) {
  const removal_sites = args.data.root.removal_sites;
  const removal_list = {
    removal_sites: removal_sites,
  };
  return args.fn(removal_list);
}

function assignRemovalFilters(removeResults) {
  removeResults.forEach((result) => {
    if (
      result.current_step === REMOVAL_CONSTANTS.REMOVAL_STEP["BLOCKED"].code
    ) {
      result.filter = REMOVAL_STATUS[result.current_step];
    } else {
      result.filter = REMOVAL_STATUS[result.status];
    }
  });
}

function localizeRemoveStatus(removeResults, locales) {
  removeResults.forEach((result) => {
    if (
      REMOVAL_CONSTANTS.REMOVAL_STEP[result.current_step] &&
      REMOVAL_CONSTANTS.REMOVAL_STEP[result.current_step].locale_var
    ) {
      result.current_step_text = LocaleUtils.formatRemoveString(
        REMOVAL_CONSTANTS.REMOVAL_STEP[result.current_step].locale_var
      );
    } else {
      result.current_step_text = sentenceCase(result.current_step);
    }
  });
}

function trimRemoveInfo(removeResult, args) {
  let infoString = "";

  let addSpace = "";

  if (
    this.email_matches.length ||
    this.phone_matches.length ||
    this.name_matches.length ||
    this.address_matches.length
  ) {
    addSpace = " ";
  }
  if (this.email_matches.length) {
    infoString += `${LocaleUtils.formatRemoveString(
      "remove-result-email"
    )},${addSpace}`;
  }
  if (this.phone_matches.length) {
    infoString += `${LocaleUtils.formatRemoveString(
      "remove-result-phone"
    )},${addSpace}`;
  }
  if (this.name_matches.length) {
    infoString += `${LocaleUtils.formatRemoveString(
      "remove-result-name"
    )},${addSpace}`;
  }
  if (this.address_matches.length) {
    infoString += `${LocaleUtils.formatRemoveString(
      "remove-result-address"
    )},${addSpace}`;
  }
  return infoString.slice(0, -2); //trim last comma and space
}

function getRemoveDashData(args) {
  const verifiedEmails = args.data.root.verifiedEmails;
  const locales = args.data.root.req.supportedLocales;
  const removeResults = args.data.root.removeData;

  verifiedEmails.sort((a, b) => {
    if (
      (a.breaches.length === 0 && b.breaches.length > 0) ||
      (b.breaches.length === 0 && a.breaches.length > 0)
    ) {
      return b.breaches.length - a.breaches.length;
    }
    return 0;
  });

  let upDate;

  if (removeResults && removeResults.length) {
    const removalDates = [];
    removeResults.forEach((result) => {
      result.info = verifiedEmails[0].email; //MH TODO: find the most recent date from all results, not just date of first result
      removalDates.push(result.updated_at);
    });
    removalDates.sort();
    upDate = FormUtils.convertTimestamp(removalDates[removalDates.length - 1]); //grab the most recent date
  } else {
    const curDate = new Date();
    const options = {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    };
    upDate = curDate.toLocaleDateString(locales, options);
  }

  if (removeResults && removeResults.length) {
    assignRemovalFilters(removeResults);
    localizeRemoveStatus(removeResults, locales);
  }

  const emailCards = {
    verifiedEmails: verifiedEmails,
    breaches: verifiedEmails[0].breaches.length,
    lastUpdate: upDate,
    removeResults: removeResults,
  };

  return args.fn(emailCards);
}

function getRemovalFilters(args) {
  const removalFilterArr = [];

  Object.values(REMOVAL_STATUS).forEach((filter) => {
    const filterObj = {
      icon: filter.icon,
      statusText: LocaleUtils.formatRemoveString(filter.locale_var),
      id: filter.id,
    };
    removalFilterArr.push(filterObj);
  });
  const removeFilters = {
    filters: removalFilterArr,
  };

  return args.fn(removeFilters);
  //return args.fn(removalFilterArr);
}

function getFullName(args) {
  const userEmail = args.data.root.req.session.user.fxa_profile_json.email;
  const removeAcctInfo = args.data.root.removeAcctInfo;

  let userDisplayName = userEmail;

  if (removeAcctInfo && removeAcctInfo.names && removeAcctInfo.names.length) {
    const nameObj = removeAcctInfo.names[0];
    let nameString = "";
    if (nameObj.last_name) {
      nameString += `${nameObj.last_name},`;
    }
    if (nameObj.first_name) {
      nameString += ` ${nameObj.first_name}`;
    }
    if (nameObj.middle_name) {
      nameString += ` ${nameObj.middle_name}`;
    }

    userDisplayName = nameString;
  }

  return userDisplayName;
}

function getConfirmSubmitText(args) {
  const kid = args.data.root.req.user.kid;
  if (kid) {
    return LocaleUtils.formatRemoveString("remove-dash-confirm-submit-update");
  } else {
    return LocaleUtils.formatRemoveString("remove-dash-confirm-submit-new");
  }
}

//END DATA REMOVAL SPECIFIC

module.exports = {
  getUserPreferences,
  getBreachesDashboard,
  welcomeMessage,
  getLastAddedEmailStrings,
  makeEmailVerifiedString,
  makeEmailAddedToSubscriptionString,
  enLocaleIsSupported,
  //DATA REMOVAL SPECIFIC
  getRemoveFormData,
  getRemoveDashData,
  getRemovalSitesList,
  getRemovalFilters,
  trimRemoveInfo,
  getFullName,
  getConfirmSubmitText,
};
