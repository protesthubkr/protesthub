import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStatementFeedItems } from "@/lib/telegram-statements/public-feed";
import { groupStatementItemsByDate } from "./statement-date-groups";
import { StatementFeedList } from "./statement-feed-list";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "입장문 피드",
  description: "주요 단체와 정당의 입장문 핵심 원문 문장 피드",
};

export default async function StatementsPage() {
  const items = await getPublicStatementFeedItems();
  const dateGroups = groupStatementItemsByDate(items);

  return (
    <main className="statement-shell">
      <header className="statement-topbar">
        <Link className="statement-home-link" href="/">
          집회
        </Link>
        <h1>입장문</h1>
      </header>
      {items.length > 0 ? (
        <StatementFeedList dateGroups={dateGroups} />
      ) : (
        <section className="statement-empty">
          <h2>아직 공개된 입장문이 없습니다</h2>
        </section>
      )}
    </main>
  );
}
