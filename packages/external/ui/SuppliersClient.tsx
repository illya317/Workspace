"use client";

import ExternalPartyClient from "./ExternalPartyClient";

export default function SuppliersClient(props: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  return <ExternalPartyClient category="supplier" apiPath="/api/modules/external/suppliers" {...props} />;
}
