"use client";

import ExternalPartyClient from "./ExternalPartyClient";

export default function CustomersClient(props: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  return <ExternalPartyClient category="customer" apiPath="/api/modules/external/customers" {...props} />;
}
