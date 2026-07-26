export type DimKey =
  | "gender"
  | "age"
  | "education"
  | "politics"
  | "company"
  | "ethnicity"
  | "tenure"
  | "rank"
  | "personnelType";

export const DIM_LABELS: Record<DimKey, string> = {
  gender: "性别",
  age: "年龄",
  education: "学历",
  politics: "政治面貌",
  company: "公司",
  ethnicity: "民族",
  tenure: "司龄",
  rank: "职级",
  personnelType: "人员类型",
};

export const DIM_COLORS: Record<DimKey, string> = {
  gender: "bg-blue-400",
  age: "bg-emerald-400",
  education: "bg-amber-400",
  politics: "bg-purple-400",
  company: "bg-sky-400",
  ethnicity: "bg-rose-400",
  tenure: "bg-indigo-400",
  rank: "bg-teal-400",
  personnelType: "bg-orange-400",
};

export const DIM_ORDER: Record<string, Record<string, number>> = {
  gender: { "男": 0, "女": 1, "未知": 2 },
  age: { "25岁以下": 0, "25-29岁": 1, "30-34岁": 2, "35-39岁": 3, "40-44岁": 4, "45-49岁": 5, "50岁及以上": 6, "未知": 7 },
  tenure: { "<1年": 0, "1-3年": 1, "3-5年": 2, "5-10年": 3, "≥10年": 4, "未知": 5 },
};

export const featureList: DimKey[] = [
  "gender",
  "age",
  "education",
  "politics",
  "company",
  "ethnicity",
  "tenure",
  "rank",
  "personnelType",
];
