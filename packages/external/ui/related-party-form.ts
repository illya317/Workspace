import type {
  CreateSurfaceSectionSpec,
  FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type {
  ExternalRelatedParty,
  ExternalRelatedPartyCandidate,
} from "@workspace/external/types";
import {
  EXTERNAL_PARTY_RELATED_PARTY_LABELS,
  EXTERNAL_PARTY_ROLE_LABELS,
} from "./external-party-form";

export interface RelatedPartyCreateDraft {
  partyId: number | null;
  relatedPartyType: ExternalRelatedParty["relatedPartyType"] | "";
}

export function emptyRelatedPartyCreateDraft(): RelatedPartyCreateDraft {
  return { partyId: null, relatedPartyType: "" };
}

export function relatedPartyCreateSections(
  draft: RelatedPartyCreateDraft,
  candidates: readonly ExternalRelatedPartyCandidate[],
  loading: boolean,
  error: string | null,
  onChange: <K extends keyof RelatedPartyCreateDraft>(key: K, value: RelatedPartyCreateDraft[K]) => void,
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  return [{
    key: "related-party-registration",
    title: "关联方登记",
    layout: { columns: 2, density: "compact" },
    items: [
      {
        key: "partyId",
        label: "客户/供应商",
        required: true,
        hint: "候选来自当前账号可读取的客户和供应商名单",
        spec: {
          valueType: "string",
          control: "choice",
          options: {
            source: "static",
            items: candidates.map((candidate) => {
              const roleNames = candidate.roles.map((role) => EXTERNAL_PARTY_ROLE_LABELS[role]).join(" / ");
              const details = [roleNames, candidate.fullName, candidate.identityNumber].filter(Boolean).join(" · ");
              return {
                value: String(candidate.id),
                label: candidate.name,
                subtitle: details,
                searchText: [candidate.name, candidate.fullName, candidate.identityNumber, roleNames].filter(Boolean).join(" "),
              };
            }),
            visibleCount: 8,
          },
        },
        value: draft.partyId ? String(draft.partyId) : "",
        loading,
        emptyText: error || "没有可登记的客户或供应商",
        onChange: (value) => {
          const partyId = Number(value);
          onChange("partyId", Number.isInteger(partyId) && partyId > 0 ? partyId : null);
        },
      },
      {
        key: "relatedPartyType",
        label: "关系性质",
        required: true,
        spec: {
          valueType: "string",
          control: "choice",
          options: {
            source: "static",
            items: Object.entries(EXTERNAL_PARTY_RELATED_PARTY_LABELS)
              .filter(([value]) => value !== "unrelated")
              .map(([value, label]) => ({ value, label })),
            visibleCount: 5,
          },
        },
        value: draft.relatedPartyType,
        onChange: (value) => {
          const normalized = String(value) as ExternalRelatedParty["relatedPartyType"];
          onChange(
            "relatedPartyType",
            normalized !== "unrelated" && normalized in EXTERNAL_PARTY_RELATED_PARTY_LABELS ? normalized : "",
          );
        },
      },
    ],
  }];
}
