"use client";

import ExternalPartyClient from "./ExternalPartyClient";

export default function CustomersClient(props: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canReadOtherRole: boolean;
  canUpdateOtherRole: boolean;
}) {
  return (
    <ExternalPartyClient
      category="customer"
      apiPath="/api/modules/external/customers"
      otherApiPath={props.canReadOtherRole ? "/api/modules/external/suppliers" : undefined}
      canCreate={props.canCreate}
      canUpdate={props.canUpdate}
      canDelete={props.canDelete}
      canUpdateOtherRole={props.canUpdateOtherRole}
    />
  );
}
