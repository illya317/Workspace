declare const approvalCommitAuthorizationBrand: unique symbol;

export type ApprovalCommitAuthorization = Readonly<{
  [approvalCommitAuthorizationBrand]: true;
}>;
