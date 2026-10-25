"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeWishAction } from "@/app/(app)/discover/actions";
import { Button } from "@/components/ui/button";

export function RemoveWishButton({ wishId, label }: { wishId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 flex-1"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await removeWishAction(wishId);
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
