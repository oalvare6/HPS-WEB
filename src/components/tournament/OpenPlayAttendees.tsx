import { Users } from "lucide-react";
import {
  attendeeDisplayName,
  type OpenPlayAttendee,
} from "@/lib/open-play-attendance";

/**
 * "Who's coming" for an open-play night — the public answer to the only
 * question a Friday-night player actually has, which is whether there will be
 * enough people to make a game.
 *
 * ## Why the names are already truncated when they arrive
 *
 * This component renders `firstName` + `lastInitial` because that is all it is
 * ever given: `public.open_play_attendees()` truncates the surname in SQL. It
 * deliberately does **not** take a full name and shorten it for display — that
 * version would look identical on screen while shipping every attendee's
 * surname in the RSC payload, visible to anyone who opens the network tab. If
 * you ever find yourself passing a `lastName` into this file, the privacy
 * property has been lost somewhere upstream.
 *
 * A server component with no interactivity, so nothing here reaches the client
 * bundle at all.
 */
export function OpenPlayAttendees({
  attendees,
}: {
  attendees: OpenPlayAttendee[];
}) {
  const count = attendees.length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Users size={18} className="text-brand" />
        <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
          Who&apos;s coming
        </h2>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        {count === 0
          ? "Nobody has confirmed yet — be the first."
          : count === 1
            ? "1 player confirmed so far."
            : `${count} players confirmed so far.`}
      </p>

      {count > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attendees.map((a, i) => (
            <li
              // Two "Omar A."s are a real possibility on a list this short and
              // are not a bug — the index keeps them distinct as React nodes
              // without inventing an identifier the server never sent.
              key={`${a.firstName}-${a.lastInitial}-${i}`}
              className="px-3 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800 text-sm text-zinc-200"
            >
              {attendeeDisplayName(a)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
