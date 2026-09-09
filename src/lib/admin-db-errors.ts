/**
 * Database errors in the owner's words.
 *
 * Every admin route used to return `error.message` straight from Postgres, so a
 * duplicate match number read as `duplicate key value violates unique
 * constraint "matches_tournament_match_number_idx"` on a phone at the field.
 * One translation, used by every schedule route, so the sentence the owner
 * sees is the same wherever the rule bites.
 */

export type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type TranslatedError = { message: string; status: number };

export function translateDbError(
  err: DbErrorLike | null | undefined,
  fallback = "Something went wrong saving that. Try again."
): TranslatedError {
  const code = err?.code ?? "";
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;

  switch (code) {
    case "23505": // unique_violation
      if (text.includes("matches_tournament_match_number_idx")) {
        return {
          message: "That match number is already used in this event.",
          status: 409,
        };
      }
      if (text.includes("teams_tournament_name_unique_idx")) {
        return {
          message: "A team with that name already exists in this event.",
          status: 409,
        };
      }
      return { message: "That already exists.", status: 409 };
    case "23514": // check_violation
      if (text.includes("matches_completed_has_scores")) {
        return {
          message:
            "A completed match needs both scores. Use Clear result if it was not played.",
          status: 400,
        };
      }
      return { message: "That value is not allowed.", status: 400 };
    case "23503": // foreign_key_violation
      return {
        message: "That team, round or player no longer exists. Reload and try again.",
        status: 409,
      };
    case "P0001": // raise exception from save_match_result / clear_match_result
      return { message: err?.message ?? fallback, status: 400 };
    case "P0002": // no_data_found raised by our functions
      return { message: err?.message ?? "Not found.", status: 404 };
    case "PGRST116": // .single() found no row
      return { message: "Not found.", status: 404 };
    case "42703": // undefined_column: code deployed ahead of the migration
      return {
        message:
          "The database is missing a column this needs. Apply the latest migration, then try again.",
        status: 500,
      };
    case "42883": // undefined_function: same, for the result functions
      return {
        message:
          "The database is missing a function this needs. Apply the latest migration, then try again.",
        status: 500,
      };
    default:
      return { message: fallback, status: 500 };
  }
}
