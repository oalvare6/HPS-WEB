-- Enable citext for case-insensitive email storage on contacts.
-- Safe to re-run.

create extension if not exists citext;
