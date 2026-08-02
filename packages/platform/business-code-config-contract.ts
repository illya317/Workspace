export type SequentialBusinessCodeRule = {
  prefix: string;
  separator: string;
  sequenceLength: number;
  sequenceStart: number;
};

export const DEPARTMENT_IDENTIFIER_FORMATS = [
  "uppercaseLetters",
  "uppercaseAlphanumeric",
  "freeText",
] as const;

export type DepartmentIdentifierFormat = (typeof DEPARTMENT_IDENTIFIER_FORMATS)[number];

export type DepartmentCodeRule = {
  identifierFormat: DepartmentIdentifierFormat;
  identifierLength: number;
  functionalPrefix: string;
  separator: string;
  managementRootSuffix: string;
  level2Suffix: string;
  level2SequenceLength: number;
  level3SequenceLength: number;
};
