"use server";

import { currentUser } from "@clerk/nextjs/server";
import { withAuthenticatedAction } from "./action-client";

export async function ensureActorIdentityAction() {
  return withAuthenticatedAction(async ({ services }, actorId) => {
    const user = await currentUser();
    const primaryEmail = user?.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    );
    const email = primaryEmail?.emailAddress;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    const profile = await services.identity.ensureActor(actorId, {
      email,
      sourceUpdatedAt: user?.updatedAt ? new Date(user.updatedAt) : undefined,
      verified: primaryEmail?.verification?.status === "verified",
      name: name.length > 0 ? name : undefined,
    });

    return profile;
  });
}
