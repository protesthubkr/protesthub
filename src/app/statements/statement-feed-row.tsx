import Image from "next/image";
import type { PublicStatementFeedItem } from "@/lib/telegram-statements/public-feed";
import { formatStatementTime } from "./statement-format";
import {
  getAvatarLabel,
  getAvatarTone,
  getStatementProfile,
  isPartyStatementProfile,
} from "./statement-profile";

export function StatementFeedRow({ item }: { item: PublicStatementFeedItem }) {
  const profile = getStatementProfile(item);
  const side = isPartyStatementProfile(profile) ? "left" : "right";
  const avatarTone = getAvatarTone(profile.label);
  const avatarLabel = getAvatarLabel(profile.label);
  const displayTime = formatStatementTime(item);

  return (
    <a
      aria-label={`${item.organizationName} - ${item.coreSentence}`}
      className={`statement-feed-row statement-feed-row--${side}`}
      href={item.sourceUrl}
      rel="noreferrer"
      target="_blank"
    >
      <span className="statement-author">
        {profile.logoSrc ? (
          <span
            aria-hidden="true"
            className="statement-avatar statement-avatar--logo"
          >
            <Image
              alt=""
              className="statement-avatar-image"
              height={28}
              src={profile.logoSrc}
              width={28}
            />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={`statement-avatar statement-avatar--tone-${avatarTone}`}
          >
            {avatarLabel}
          </span>
        )}
        <span className="statement-organization" title={item.organizationName}>
          {profile.label}
        </span>
      </span>
      <span className="statement-message">
        <span className="statement-bubble">
          <span className="statement-core-sentence">{item.coreSentence}</span>
        </span>
        {displayTime ? (
          <time className="statement-time" dateTime={item.messageCreatedAt ?? ""}>
            {displayTime}
          </time>
        ) : null}
      </span>
    </a>
  );
}
