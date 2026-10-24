"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MOMENT_TYPES, type MomentType } from "@/lib/feed/types";

/** One-tap growth moments. After a photo, `withNothing` adds "Nothing new" and drops "Repotted". */
export function MomentPicker({
  onPick,
  withNothing = false,
  disabled = false,
}: {
  onPick: (moment: MomentType | null) => void;
  withNothing?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("feed");
  const types = withNothing ? MOMENT_TYPES.filter((m) => m !== "repotted") : MOMENT_TYPES;
  return (
    <div className="flex flex-wrap gap-2">
      {types.map((m) => (
        <Button key={m} type="button" variant="outline" className="h-11" disabled={disabled} onClick={() => onPick(m)}>
          {t(`moments.${m}`)}
        </Button>
      ))}
      {withNothing ? (
        <Button type="button" variant="ghost" className="h-11" disabled={disabled} onClick={() => onPick(null)}>
          {t("nothingNew")}
        </Button>
      ) : null}
    </div>
  );
}
