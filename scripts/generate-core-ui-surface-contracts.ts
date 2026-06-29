import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

type ContractTarget = {
  componentName: string;
  sourcePath: string;
  typeName: string;
};

type ContractDescriptor = {
  name: string;
  description: string;
  children?: ContractDescriptor[];
};

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "packages/core/ui/registry/generated-surface-contracts.ts");
const MAX_DEPTH = 12;

const TARGETS: ContractTarget[] = [
  { componentName: "BodySurface", sourcePath: "packages/core/ui/BodySurface.tsx", typeName: "BodySurfaceProps" },
  { componentName: "BlockSurface", sourcePath: "packages/core/ui/BlockSurface.tsx", typeName: "BlockSurfaceProps" },
  { componentName: "DataSurface", sourcePath: "packages/core/ui/DataSurface.types.ts", typeName: "DataSurfaceProps" },
  { componentName: "DocumentSurface", sourcePath: "packages/core/ui/DocumentSurface.tsx", typeName: "DocumentSurfaceProps" },
  { componentName: "FormSurface", sourcePath: "packages/core/ui/FormSurface.types.ts", typeName: "FormSurfaceProps" },
  { componentName: "InputControl", sourcePath: "packages/core/ui/internal/input/InputControlTypes.ts", typeName: "InputControlProps" },
  { componentName: "MetricsSurface", sourcePath: "packages/core/ui/MetricsSurface.tsx", typeName: "MetricsSurfaceProps" },
  { componentName: "NavigationRenderer", sourcePath: "packages/core/ui/NavigationRenderer.tsx", typeName: "NavigationRendererProps" },
  { componentName: "PageSurface", sourcePath: "packages/core/ui/PageSurface.types.ts", typeName: "PageSurfaceProps" },
  { componentName: "RecordSurface", sourcePath: "packages/core/ui/RecordSurface.tsx", typeName: "RecordSurfaceProps" },
  { componentName: "SelectorSurface", sourcePath: "packages/core/ui/SelectorSurface.tsx", typeName: "SelectorSurfaceProps" },
  { componentName: "VisualizationSurface", sourcePath: "packages/core/ui/VisualizationSurfaceTypes.ts", typeName: "VisualizationSurfaceProps" },
];

function readTsConfig() {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("Cannot find tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
}

function createProgram() {
  const parsed = readTsConfig();
  return ts.createProgram({
    rootNames: TARGETS.map((target) => path.join(ROOT, target.sourcePath)),
    options: {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
    },
  });
}

function typeDeclarationFor(sourceFile: ts.SourceFile, typeName: string) {
  for (const statement of sourceFile.statements) {
    if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name.text === typeName) {
      return statement;
    }
  }
  throw new Error(`Cannot find ${typeName} in ${path.relative(ROOT, sourceFile.fileName)}`);
}

function isExternalType(type: ts.Type) {
  const declarations = [
    ...(type.symbol?.declarations ?? []),
    ...(type.aliasSymbol?.declarations ?? []),
  ];
  if (hasLocalCoreUiDeclaration(declarations)) return false;
  return declarations.some((declaration) => declaration.getSourceFile().fileName.includes(`${path.sep}node_modules${path.sep}`));
}

function hasLocalCoreUiDeclaration(declarations: readonly ts.Declaration[]) {
  return declarations.some((declaration) => {
    const fileName = declaration.getSourceFile().fileName;
    return fileName.startsWith(path.join(ROOT, "packages/core/ui"));
  });
}

function isLocalCoreUiType(type: ts.Type) {
  const declarations = [
    ...(type.symbol?.declarations ?? []),
    ...(type.aliasSymbol?.declarations ?? []),
  ];
  return hasLocalCoreUiDeclaration(declarations);
}

function isFunctionLikeType(type: ts.Type, checker: ts.TypeChecker) {
  return checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0
    || checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0;
}

function nonNullableType(type: ts.Type, checker: ts.TypeChecker) {
  return checker.getNonNullableType(type);
}

function stringLiteralValues(type: ts.Type): string[] {
  const values = new Set<string>();
  const visit = (candidate: ts.Type) => {
    if (candidate.isStringLiteral()) values.add(candidate.value);
    else if (candidate.isNumberLiteral()) values.add(String(candidate.value));
    else if (candidate.isUnion()) candidate.types.forEach(visit);
  };
  visit(type);
  return [...values].sort((left, right) => left.localeCompare(right));
}

function isNonLiteralPrimitiveType(type: ts.Type) {
  if (type.isStringLiteral() || type.isNumberLiteral()) return false;
  return Boolean(type.flags & (
    ts.TypeFlags.String
    | ts.TypeFlags.Number
    | ts.TypeFlags.Boolean
    | ts.TypeFlags.BigInt
    | ts.TypeFlags.ESSymbol
    | ts.TypeFlags.StringLike
    | ts.TypeFlags.NumberLike
    | ts.TypeFlags.BooleanLike
    | ts.TypeFlags.BigIntLike
    | ts.TypeFlags.Null
    | ts.TypeFlags.Undefined
    | ts.TypeFlags.Void
    | ts.TypeFlags.Any
    | ts.TypeFlags.Unknown
    | ts.TypeFlags.Never
  ));
}

function hasNonLiteralPrimitiveBranch(type: ts.Type): boolean {
  if (isNonLiteralPrimitiveType(type)) return true;
  if (!type.isUnion()) return false;
  return type.types.some(hasNonLiteralPrimitiveBranch);
}

function isArrayLikeContractType(type: ts.Type, checker: ts.TypeChecker, node: ts.Node): boolean {
  if (type.isUnion()) return type.types.some((part) => isArrayLikeContractType(part, checker, node));
  if (checker.isArrayType(type) || checker.isTupleType(type)) return true;
  const text = typeText(type, checker, node);
  return text.endsWith("[]")
    || text.startsWith("Array<")
    || text.startsWith("readonly ")
    || text.startsWith("Set<")
    || text.startsWith("ReadonlySet<")
    || text.startsWith("Map<")
    || text.startsWith("ReadonlyMap<");
}

function arrayElementTypes(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  if (type.isUnion()) return type.types.flatMap((part) => arrayElementTypes(part, checker));
  if (!checker.isArrayType(type) && !checker.isTupleType(type)) return [];
  const args = checker.getTypeArguments(type as ts.TypeReference);
  if (checker.isTupleType(type)) return [...args];
  return args[0] ? [args[0]] : [];
}

function indexedValueTypes(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  if (type.isUnion()) return type.types.flatMap((part) => indexedValueTypes(part, checker));
  const valueType = checker.getIndexTypeOfType(type, ts.IndexKind.String)
    ?? checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  return valueType ? [valueType] : [];
}

function typeText(type: ts.Type, checker: ts.TypeChecker, node: ts.Node) {
  let text: string;
  try {
    text = checker.typeToString(
      type,
      node,
      ts.TypeFormatFlags.NoTruncation
        | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
        | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
    );
  } catch {
    text = String(type.aliasSymbol?.escapedName ?? type.symbol?.escapedName ?? "unknown");
  }
  if (text.includes("ReactElement<") && text.includes("ReactPortal")) return "ReactNode";
  return text;
}

function typeKeyFor(type: ts.Type, checker: ts.TypeChecker, node: ts.Node) {
  return String(type.aliasSymbol?.escapedName ?? type.symbol?.escapedName ?? typeText(type, checker, node));
}

function isExpandableContractType(type: ts.Type, checker: ts.TypeChecker) {
  const targetType = nonNullableType(type, checker);
  return !isExternalType(targetType) && !isFunctionLikeType(targetType, checker) && isLocalCoreUiType(targetType);
}

function descriptionFor(symbol: ts.Symbol | undefined, type: ts.Type, checker: ts.TypeChecker, node: ts.Node) {
  const docs = symbol ? ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() : "";
  if (docs) return docs;

  const literals = stringLiteralValues(type);
  if (literals.length > 0) return `可选值：${literals.join(" / ")}。`;

  return `类型：${typeText(type, checker, node)}。`;
}

function literalValuesForTypes(types: ts.Type[]) {
  return [...new Set(types.flatMap((type) => stringLiteralValues(type)))]
    .sort((left, right) => left.localeCompare(right));
}

function typeTextForTypes(types: ts.Type[], checker: ts.TypeChecker, node: ts.Node) {
  return [...new Set(types.map((type) => typeText(type, checker, node)))].join(" | ");
}

function descriptionForPropertyGroup(symbol: ts.Symbol | undefined, types: ts.Type[], checker: ts.TypeChecker, node: ts.Node) {
  const docs = symbol ? ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() : "";
  if (docs) return docs;

  const literals = literalValuesForTypes(types);
  if (literals.length > 0) return `可选值：${literals.join(" / ")}。`;

  return `类型：${typeTextForTypes(types, checker, node)}。`;
}

type PropertyGroup = {
  name: string;
  symbols: ts.Symbol[];
};

type KindBranch = {
  kind: string;
  type: ts.Type;
};

type KindUnionContractOptions = {
  hoistCommonProperties?: boolean;
  branchChildren?: "all" | "standard-only";
  branchOrder?: readonly string[];
  depth?: number;
  seenTypes?: Set<string>;
  expandBranchProperties?: boolean;
};

function collectPropertyGroups(type: ts.Type): PropertyGroup[] {
  const properties: PropertyGroup[] = [];
  const byName = new Map<string, PropertyGroup>();
  const collect = (candidate: ts.Type) => {
    const branchProperties = candidate.getProperties();
    for (const property of branchProperties) {
      const existing = byName.get(property.name);
      if (existing) {
        existing.symbols.push(property);
        continue;
      }
      const group = { name: property.name, symbols: [property] };
      byName.set(property.name, group);
      properties.push(group);
    }
  };
  if (type.isUnion()) type.types.forEach(collect);
  else collect(type);
  return properties;
}

function propertyGroupByName(type: ts.Type) {
  return new Map(collectPropertyGroups(type).map((property) => [property.name, property]));
}

function discriminatedKindBranches(type: ts.Type, checker: ts.TypeChecker): KindBranch[] | null {
  const sourceTypes = type.isUnion() ? type.types : [type];
  const branches: KindBranch[] = [];

  for (const branch of sourceTypes) {
    const kindSymbol = branch.getProperty("kind");
    if (!kindSymbol) return null;
    const declaration = kindSymbol.valueDeclaration ?? kindSymbol.declarations?.[0];
    if (!declaration) return null;
    const kindType = nonNullableType(checker.getTypeOfSymbolAtLocation(kindSymbol, declaration), checker);
    const values = stringLiteralValues(kindType);
    if (!values.length) return null;
    for (const value of values) branches.push({ kind: value, type: branch });
  }

  return branches.length ? branches.sort((left, right) => left.kind.localeCompare(right.kind)) : null;
}

function commonPropertyNames(branches: KindBranch[]) {
  const [first, ...rest] = branches;
  const common = new Set(collectPropertyGroups(first.type).map((property) => property.name));
  for (const branch of rest) {
    const names = new Set(collectPropertyGroups(branch.type).map((property) => property.name));
    for (const name of [...common]) {
      if (!names.has(name)) common.delete(name);
    }
  }
  return common;
}

function descriptorForCommonProperty(
  name: string,
  branches: KindBranch[],
  checker: ts.TypeChecker,
  fallbackNode: ts.Node,
) {
  const symbols = branches
    .map((branch) => propertyGroupByName(branch.type).get(name)?.symbols ?? [])
    .flat();
  return descriptorForPropertyGroup({ name, symbols }, checker, fallbackNode, 0, new Set());
}

function propertyHasRenderableType(property: PropertyGroup, checker: ts.TypeChecker, fallbackNode: ts.Node) {
  return property.symbols.some((symbol) => {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? fallbackNode;
    const type = nonNullableType(checker.getTypeOfSymbolAtLocation(symbol, declaration), checker);
    return !Boolean(type.flags & ts.TypeFlags.Never);
  });
}

function contractForKindUnion(
  type: ts.Type,
  checker: ts.TypeChecker,
  fallbackNode: ts.Node,
  options: KindUnionContractOptions = {},
) {
  const branches = discriminatedKindBranches(type, checker);
  if (!branches) return null;

  const hoistCommonProperties = options.hoistCommonProperties ?? true;
  const branchOrder = options.branchOrder;
  const orderedBranches = branchOrder
    ? [...branches].sort((left, right) => {
        const leftIndex = branchOrder.indexOf(left.kind);
        const rightIndex = branchOrder.indexOf(right.kind);
        const leftRank = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
        const rightRank = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank || left.kind.localeCompare(right.kind);
      })
    : branches;
  const common = commonPropertyNames(orderedBranches);
  const kindValues = orderedBranches.map((branch) => branch.kind);
  const branchDepth = options.expandBranchProperties ? options.depth ?? 0 : MAX_DEPTH;
  const branchSeenTypes = options.expandBranchProperties ? options.seenTypes ?? new Set<string>() : new Set<string>();
  const kindDescriptor: ContractDescriptor = {
    name: "kind",
    description: `可选值：${kindValues.join(" / ")}。`,
    children: orderedBranches.map((branch) => {
      const branchProperties = options.branchChildren === "standard-only" && branch.kind !== "standard"
        ? []
        : collectPropertyGroups(branch.type)
          .filter((property) => property.name !== "kind")
          .filter((property) => !hoistCommonProperties || !common.has(property.name))
          .filter((property) => propertyHasRenderableType(property, checker, fallbackNode))
          .map((property) => descriptorForPropertyGroup(property, checker, fallbackNode, branchDepth, new Set(branchSeenTypes)));
      return {
        name: branch.kind,
        description: `${branch.kind} 分支声明。`,
        ...(branchProperties.length ? { children: branchProperties } : {}),
      };
    }),
  };

  const topLevel = collectPropertyGroups(type)
    .filter((property) => hoistCommonProperties && property.name !== "kind" && common.has(property.name))
    .filter((property) => propertyHasRenderableType(property, checker, fallbackNode))
    .map((property) => descriptorForCommonProperty(property.name, orderedBranches, checker, fallbackNode));
  return [...topLevel, kindDescriptor];
}

function childrenFor(
  rawType: ts.Type,
  checker: ts.TypeChecker,
  node: ts.Node,
  depth: number,
  seenTypes: Set<string>,
): ContractDescriptor[] | undefined {
  if (depth >= MAX_DEPTH) return undefined;

  const type = nonNullableType(rawType, checker);
  const literalValues = stringLiteralValues(type);
  if (literalValues.length > 0) {
    return literalValues.map((value) => ({ name: value, description: "字面量取值。" }));
  }
  if (hasNonLiteralPrimitiveBranch(type)) return undefined;
  if (isFunctionLikeType(type, checker)) return undefined;

  const typeKey = typeKeyFor(type, checker, node);
  if (typeKey.startsWith("[") || typeKey.startsWith("readonly [")) return undefined;
  if (seenTypes.has(typeKey)) return undefined;
  const nextSeenTypes = new Set(seenTypes);
  nextSeenTypes.add(typeKey);

  const elements = arrayElementTypes(type, checker);
  const indexValues = indexedValueTypes(type, checker);
  const shouldExpand = isExpandableContractType(type, checker)
    || elements.some((element) => isExpandableContractType(element, checker))
    || indexValues.some((value) => isExpandableContractType(value, checker)
      || arrayElementTypes(value, checker).some((element) => isExpandableContractType(element, checker)));
  if (!shouldExpand) return undefined;

  const kindUnionContract = contractForKindUnion(type, checker, node, {
    depth: depth + 1,
    seenTypes: nextSeenTypes,
    expandBranchProperties: isExpandableContractType(type, checker),
  });
  if (kindUnionContract) return kindUnionContract;
  if (elements.length) {
    const children = descriptorListForTypes(elements, checker, node, depth + 1, nextSeenTypes);
    return children?.length ? children : undefined;
  }
  if (indexValues.length) {
    const children = indexValues.flatMap((valueType) =>
      childrenFor(valueType, checker, node, depth + 1, nextSeenTypes) ?? [],
    );
    return children?.length ? children : undefined;
  }
  if (isArrayLikeContractType(type, checker, node)) return undefined;
  if (isExternalType(type)) return undefined;

  const targetType = type;
  if (isExternalType(targetType) || isFunctionLikeType(targetType, checker)) return undefined;

  const properties = collectPropertyGroups(targetType);
  if (!properties.length) return undefined;

  const descriptors = properties
    .filter((property) => property.name !== "__type")
    .map((property) => descriptorForPropertyGroup(property, checker, node, depth + 1, nextSeenTypes));
  return descriptors.length ? descriptors : undefined;
}

function descriptorListForTypes(
  types: ts.Type[],
  checker: ts.TypeChecker,
  fallbackNode: ts.Node,
  depth: number,
  seenTypes: Set<string>,
): ContractDescriptor[] | undefined {
  if (depth >= MAX_DEPTH) return undefined;

  const nonNullableTypes = types.map((type) => nonNullableType(type, checker));
  const unionLike = nonNullableTypes.length === 1 ? nonNullableTypes[0] : undefined;
  const kindUnionContract = unionLike
    ? contractForKindUnion(unionLike, checker, fallbackNode, {
        depth: depth + 1,
        seenTypes,
        expandBranchProperties: isExpandableContractType(unionLike, checker),
      })
    : null;
  if (kindUnionContract) return kindUnionContract;

  const properties = new Map<string, PropertyGroup>();
  const ordered: PropertyGroup[] = [];
  for (const type of nonNullableTypes) {
    for (const property of collectPropertyGroups(type)) {
      const existing = properties.get(property.name);
      if (existing) {
        existing.symbols.push(...property.symbols);
        continue;
      }
      properties.set(property.name, property);
      ordered.push(property);
    }
  }
  const descriptors = ordered
    .filter((property) => property.name !== "__type")
    .map((property) => descriptorForPropertyGroup(property, checker, fallbackNode, depth + 1, new Set(seenTypes)));
  return descriptors.length ? descriptors : undefined;
}

function descriptorForPropertyGroup(
  property: PropertyGroup,
  checker: ts.TypeChecker,
  fallbackNode: ts.Node,
  depth: number,
  seenTypes: Set<string>,
): ContractDescriptor {
  const firstSymbol = property.symbols[0];
  const declaration = firstSymbol.valueDeclaration ?? firstSymbol.declarations?.[0] ?? fallbackNode;
  const rawTypes = property.symbols.map((symbol) => {
    const symbolDeclaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? declaration;
    return nonNullableType(checker.getTypeOfSymbolAtLocation(symbol, symbolDeclaration), checker);
  });
  const literalValues = literalValuesForTypes(rawTypes);
  const children = literalValues.length > 0
    ? literalValues.map((value) => ({ name: value, description: "字面量取值。" }))
    : childrenFor(rawTypes[0], checker, declaration, depth, seenTypes);
  return {
    name: property.name,
    description: descriptionForPropertyGroup(firstSymbol, rawTypes, checker, declaration),
    ...(children?.length ? { children } : {}),
  };
}

function contractFor(target: ContractTarget, program: ts.Program, checker: ts.TypeChecker) {
  const absolutePath = path.join(ROOT, target.sourcePath);
  const sourceFile = program.getSourceFile(absolutePath);
  if (!sourceFile) throw new Error(`Cannot load ${target.sourcePath}`);
  const declaration = typeDeclarationFor(sourceFile, target.typeName);
  const type = ts.isTypeAliasDeclaration(declaration)
    ? checker.getTypeFromTypeNode(declaration.type)
    : checker.getTypeAtLocation(declaration.name);
  const kindUnionContract = contractForKindUnion(type, checker, declaration, {
    hoistCommonProperties: false,
    branchChildren: target.typeName === "PageSurfaceProps" ? "standard-only" : "all",
    branchOrder: target.typeName === "PageSurfaceProps" ? ["login", "directory", "standard"] : undefined,
    expandBranchProperties: true,
  });
  if (kindUnionContract) return kindUnionContract;
  return collectPropertyGroups(type).map((property) => descriptorForPropertyGroup(property, checker, declaration, 0, new Set()));
}

function formatDescriptor(descriptor: ContractDescriptor, indent: number): string {
  const pad = " ".repeat(indent);
  const nextPad = " ".repeat(indent + 2);
  const lines = [
    `${pad}{`,
    `${nextPad}name: ${JSON.stringify(descriptor.name)},`,
    `${nextPad}description: ${JSON.stringify(descriptor.description)},`,
  ];
  if (descriptor.children?.length) {
    lines.push(`${nextPad}children: [`);
    for (const child of descriptor.children) lines.push(formatDescriptor(child, indent + 4));
    lines.push(`${nextPad}],`);
  }
  lines.push(`${pad}},`);
  return lines.join("\n");
}

function formatOutput(contracts: Record<string, ContractDescriptor[]>) {
  const entries = Object.entries(contracts).sort(([left], [right]) => left.localeCompare(right));
  const lines = [
    "// Auto-generated by scripts/generate-core-ui-surface-contracts.ts",
    "// Do not edit by hand. Run `npm run core-ui:contracts` after changing Surface prop types.",
    "import type { CoreUiCapabilityDescriptor } from \"./component-registry-types\";",
    "",
    "export const generatedCoreUiSurfaceContracts = {",
  ];
  for (const [name, descriptors] of entries) {
    lines.push(`  ${name}: [`);
    for (const descriptor of descriptors) lines.push(formatDescriptor(descriptor, 4));
    lines.push("  ],");
  }
  lines.push("} as const satisfies Record<string, readonly CoreUiCapabilityDescriptor[]>;");
  lines.push("");
  return lines.join("\n");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const program = createProgram();
  const checker = program.getTypeChecker();
  const contracts: Record<string, ContractDescriptor[]> = {};
  for (const target of TARGETS) {
    contracts[target.componentName] = contractFor(target, program, checker);
  }

  const output = formatOutput(contracts);
  const current = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, "utf8") : "";
  if (checkOnly) {
    if (current !== output) {
      console.error(`${path.relative(ROOT, OUTPUT_PATH)} is stale. Run npm run core-ui:contracts.`);
      process.exit(1);
    }
    console.log("Core UI surface contracts are up to date.");
    return;
  }
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`Generated Core UI surface contracts -> ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
