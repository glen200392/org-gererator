// header-detect.ts — Fuzzy header matching for employee list import
// Supports: Traditional Chinese, Simplified Chinese, English, Japanese

/** Semantic field types that we need to map from spreadsheet columns */
export type FieldKey = "id" | "name" | "title" | "dept" | "managerId" | "email" | "phone" | "photoUrl" | "location" | "code";

export interface FieldMapping {
  fieldKey: FieldKey;
  columnIndex: number;
  columnHeader: string;
  confidence: number; // 0-1
}

export interface DetectResult {
  mappings: FieldMapping[];
  unmappedHeaders: { index: number; header: string }[];
  /** Required fields that were not auto-detected */
  missingRequired: FieldKey[];
}

/** Alias dictionary: each field maps to known header names (case-insensitive) */
const ALIASES: Record<FieldKey, string[]> = {
  id: [
    // English
    "id", "employee id", "employeeid", "emp id", "empid", "employee_id",
    "staff id", "staffid", "staff_id", "person id", "personid",
    "userid", "user id", "user_id", "number", "employee number", "emp no",
    // Chinese Traditional
    "員工編號", "編號", "工號", "人員編號", "員工號",
    // Chinese Simplified
    "员工编号", "编号", "工号",
    // Japanese
    "社員番号", "社員ID", "従業員番号", "番号",
  ],
  name: [
    "name", "full name", "fullname", "full_name", "employee name",
    "first name", "display name", "displayname",
    "姓名", "名字", "人員姓名", "員工姓名",
    "名前", "氏名", "フルネーム",
  ],
  title: [
    "title", "job title", "jobtitle", "job_title", "position",
    "position title", "role", "designation", "rank",
    "職稱", "職位", "頭銜", "崗位",
    "职称", "职位",
    "役職", "肩書き", "ポジション",
  ],
  dept: [
    "dept", "department", "department name", "dept name", "division",
    "team", "group", "org unit", "orgunit", "organization",
    "部門", "部門名稱", "部署", "組織",
    "部门", "部门名称",
    "部署", "部門名", "課",
  ],
  managerId: [
    "manager", "manager id", "managerid", "manager_id",
    "reports to", "reportsto", "reports_to", "supervisor",
    "supervisor id", "supervisorid", "parent", "parent id", "parentid",
    "boss", "boss id", "direct manager", "line manager",
    "主管", "直屬主管", "上級", "主管編號", "主管ID",
    "上级", "直属主管", "主管编号",
    "上司", "上司ID", "マネージャー",
  ],
  email: [
    "email", "e-mail", "mail", "email address",
    "電子郵件", "信箱", "邮箱", "メール",
  ],
  phone: [
    "phone", "telephone", "tel", "mobile", "cell",
    "電話", "手機", "分機", "电话", "手机",
    "電話番号", "携帯",
  ],
  photoUrl: [
    "photo", "photo url", "photourl", "photo_url", "avatar",
    "image", "picture", "headshot",
    "照片", "頭像", "头像", "写真",
  ],
  location: [
    "location", "office", "site", "city", "branch",
    "地點", "辦公室", "據點", "地点", "办公室",
    "勤務地", "オフィス",
  ],
  code: [
    "code", "dept code", "department code", "cost center",
    "costcenter", "cost_center", "org code",
    "代碼", "部門代碼", "成本中心",
    "代码", "部门代码",
    "コード", "部門コード",
  ],
};

const REQUIRED_FIELDS: FieldKey[] = ["id", "name", "dept", "managerId"];

/**
 * Detect column-to-field mapping from spreadsheet headers.
 *
 * Strategy:
 * 1. Exact match (case-insensitive, trimmed)
 * 2. Substring match (header contains alias or alias contains header)
 * 3. Required fields not matched → report as missing
 */
export function detectHeaders(headers: string[]): DetectResult {
  const mappings: FieldMapping[] = [];
  const usedColumns = new Set<number>();
  const usedFields = new Set<FieldKey>();

  // Normalize headers
  const normalized = headers.map((h) => h.trim().toLowerCase());

  // Pass 1: Exact match (confidence 1.0)
  for (const [fieldKey, aliases] of Object.entries(ALIASES) as [FieldKey, string[]][]) {
    if (usedFields.has(fieldKey)) continue;

    for (let i = 0; i < normalized.length; i++) {
      if (usedColumns.has(i)) continue;
      if (aliases.includes(normalized[i])) {
        mappings.push({ fieldKey, columnIndex: i, columnHeader: headers[i], confidence: 1.0 });
        usedColumns.add(i);
        usedFields.add(fieldKey);
        break;
      }
    }
  }

  // Pass 2: Substring match (confidence 0.7)
  for (const [fieldKey, aliases] of Object.entries(ALIASES) as [FieldKey, string[]][]) {
    if (usedFields.has(fieldKey)) continue;

    let bestMatch: { index: number; confidence: number } | null = null;

    for (let i = 0; i < normalized.length; i++) {
      if (usedColumns.has(i)) continue;
      const header = normalized[i];

      for (const alias of aliases) {
        // Require min 2 chars for reverse match to avoid false positives (e.g., "No" matching "employee number")
        const forwardMatch = header.includes(alias);
        const reverseMatch = header.length >= 2 && alias.includes(header);
        if (forwardMatch || reverseMatch) {
          const overlap = Math.min(header.length, alias.length) / Math.max(header.length, alias.length);
          const confidence = 0.5 + overlap * 0.3; // 0.5-0.8 range
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { index: i, confidence };
          }
        }
      }
    }

    if (bestMatch) {
      mappings.push({
        fieldKey,
        columnIndex: bestMatch.index,
        columnHeader: headers[bestMatch.index],
        confidence: bestMatch.confidence,
      });
      usedColumns.add(bestMatch.index);
      usedFields.add(fieldKey);
    }
  }

  // Collect unmapped headers
  const unmappedHeaders = headers
    .map((header, index) => ({ index, header }))
    .filter(({ index }) => !usedColumns.has(index));

  // Check for missing required fields
  const missingRequired = REQUIRED_FIELDS.filter((f) => !usedFields.has(f));

  return { mappings, unmappedHeaders, missingRequired };
}

/**
 * Get all available column headers for a given field (for dropdown UI).
 */
export function getFieldLabel(fieldKey: FieldKey, lang: "tw" | "en" = "tw"): string {
  const labels: Record<FieldKey, { tw: string; en: string }> = {
    id: { tw: "員工編號", en: "Employee ID" },
    name: { tw: "姓名", en: "Name" },
    title: { tw: "職稱", en: "Title" },
    dept: { tw: "部門", en: "Department" },
    managerId: { tw: "主管編號", en: "Manager ID" },
    email: { tw: "電子郵件", en: "Email" },
    phone: { tw: "電話", en: "Phone" },
    photoUrl: { tw: "照片網址", en: "Photo URL" },
    location: { tw: "地點", en: "Location" },
    code: { tw: "部門代碼", en: "Dept Code" },
  };
  return labels[fieldKey]?.[lang] ?? fieldKey;
}

/** All field keys in display order */
export const ALL_FIELD_KEYS: FieldKey[] = [
  "id", "name", "title", "dept", "managerId",
  "email", "phone", "location", "code", "photoUrl",
];

/** Check if a field is required */
export function isRequiredField(fieldKey: FieldKey): boolean {
  return REQUIRED_FIELDS.includes(fieldKey);
}
