"use strict";

exports.up = knex => {
  return knex.schema
    .createTable("email_hashes", table => {
      table.increments("id").primary();
      table.string("sha1").unique();
      table.string("email").unique();
    })
    .createTable("breaches", table => {
      table.increments("id").primary();
      table.string("name").unique();
      table.json("meta");
    })
    .createTable("breached_hashes", table => {
      table
        .integer("sha1_id")
        .unsigned()
        .references("id")
        .inTable("email_hashes");
      table
        .integer("breach_id")
        .unsigned()
        .references("id")
        .inTable("breaches");
      table
        .boolean("notified")
        .defaultTo(false);
    });
};

exports.down = knex => {
  return knex.schema
    .dropTableIfExists("breached_hashes")
    .dropTableIfExists("email_hashes")
    .dropTableIfExists("breaches");
};
