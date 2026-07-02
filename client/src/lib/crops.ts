export const CROP_TYPES = [
  "maize",
  "beans",
  "brown_rice",
  "millet",
  "bambara_beans",
  "groundnuts",
] as const;

export type CropType = (typeof CROP_TYPES)[number];

export const CROP_LABELS: Record<CropType, string> = {
  maize: "Maize",
  beans: "Beans",
  brown_rice: "Brown rice",
  millet: "Millet",
  bambara_beans: "Bambara beans",
  groundnuts: "Groundnuts",
};
