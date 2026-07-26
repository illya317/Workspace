"use client";

import ExternalPartyClient from "./ExternalPartyClient";

export default function SuppliersClient(props: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canReadOtherRole: boolean;
  canUpdateOtherRole: boolean;
}) {
  return (
    <ExternalPartyClient
      category="supplier"
      apiPath="/api/modules/external/suppliers"
      otherApiPath={props.canReadOtherRole ? "/api/modules/external/customers" : undefined}
      canCreate={props.canCreate}
      canUpdate={props.canUpdate}
      canDelete={props.canDelete}
      canUpdateOtherRole={props.canUpdateOtherRole}
    />
  );
}
