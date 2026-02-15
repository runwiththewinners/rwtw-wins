import { headers } from "next/headers";
import { whopsdk } from "@/lib/whop-sdk";
import WinsClient from "../../WinsClient";

export const dynamic = "force-dynamic";

export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}) {
  const { experienceId } = await params;
  const headersList = await headers();

  let authenticated = false;
  let userName = "";
  let userId = "";
  let userTier = "free";

  const PRODUCTS: Record<string, string> = {
    highrollers: "prod_bNsUIqwSfzLzU",
    premium: "prod_o1jjamUG8rP8W",
  };

  try {
    const result = await whopsdk.verifyUserToken(headersList, {
      dontThrow: true,
    });
    const uid = (result as any)?.userId ?? null;

    if (uid) {
      authenticated = true;
      userId = uid;

      // Try to get user info
      try {
        const userInfo = await whopsdk.users.retrieve(uid);
        userName = (userInfo as any)?.name || (userInfo as any)?.username || "";
      } catch {}

      // Check tier
      for (const [tier, prodId] of Object.entries(PRODUCTS)) {
        try {
          const response = await whopsdk.users.checkAccess(prodId, { id: uid });
          if (response.has_access === true) {
            userTier = tier;
            break;
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error("[WINS] Auth error:", e);
  }

  return (
    <WinsClient
      authenticated={authenticated}
      userName={userName}
      userId={userId}
      userTier={userTier}
    />
  );
}
