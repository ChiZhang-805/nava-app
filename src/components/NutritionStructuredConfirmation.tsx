import { Utensils, X } from "lucide-react";
import type { StructuredEntry } from "../services/structuredEntry";
import type { StructuredField } from "../services/structuredEntryParser";

type NutritionStructuredConfirmationProps = {
  record: StructuredEntry;
  locale: "zh" | "en";
  editing: boolean;
  onFieldChange: (fieldId: string, value: string) => void;
  onClose: () => void;
};

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function metric(value: unknown, unit: string, locale: "zh" | "en") {
  const parsed = numberValue(value);
  if (parsed == null) return "—";
  const formatted = Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1).replace(/\.0$/, "");
  return `${formatted}${locale === "zh" && unit === "g" ? "" : " "}${unit}`;
}

function mealName(value: unknown, locale: "zh" | "en") {
  const labels = locale === "zh"
    ? { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", pantry: "加餐" }
    : { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", pantry: "Snack" };
  return labels[textValue(value) as keyof typeof labels] ?? (locale === "zh" ? "饮食记录" : "Meal");
}

function FieldEditor({ field, label, fallback, unit, editing, onChange }: {
  field?: StructuredField;
  label: string;
  fallback: string;
  unit?: string;
  editing: boolean;
  onChange: (fieldId: string, value: string) => void;
}) {
  if (editing && field && !field.readOnly) return <span className="nutrition-result-editor">
    <input
      aria-label={label}
      inputMode={field.valueType === "number" ? "decimal" : "text"}
      value={field.value}
      onChange={(event) => onChange(field.id, event.target.value)}
    />
    {(field.unit || unit) && <em>{field.unit || unit}</em>}
  </span>;
  return <>{fallback}</>;
}

export default function NutritionStructuredConfirmation({ record, locale, editing, onFieldChange, onClose }: NutritionStructuredConfirmationProps) {
  const items = Array.isArray(record.payload.items)
    ? record.payload.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
  const fieldAt = (path: string) => record.fields.find((field) => field.path === path);
  const totalCalories = numberValue(record.payload.totalCalories ?? record.payload.calories);

  return <section className="structured-record nutrition-structured-record" data-structured-record="nutrition">
    <header className="nutrition-meal-heading">
      <span><Utensils size={18} aria-hidden="true" /><strong>{mealName(record.payload.meal, locale)}</strong></span>
      <button className="nutrition-result-close" type="button" onClick={onClose} aria-label={locale === "zh" ? "不记录并关闭" : "Discard and close"}><X size={18} /></button>
    </header>

    <div className="nutrition-result-items">
      {items.map((item, index) => {
        const name = textValue(item.name) || (locale === "zh" ? `食物 ${index + 1}` : `Food ${index + 1}`);
        const nameField = fieldAt(`items.${index}.name`);
        const quantityField = fieldAt(`items.${index}.quantity`);
        const weightField = fieldAt(`items.${index}.weight_grams`);
        const amountField = fieldAt(`items.${index}.amount`);
        const portionField = weightField ?? quantityField ?? amountField;
        const caloriesField = fieldAt(`items.${index}.calories`);
        const carbohydrateField = fieldAt(`items.${index}.carbohydrate_grams`);
        const proteinField = fieldAt(`items.${index}.protein_grams`);
        const fatField = fieldAt(`items.${index}.fat_grams`);
        const weight = numberValue(item.weight_grams);
        const quantity = numberValue(item.quantity);
        const unit = textValue(item.unit) || (weight != null ? "g" : locale === "zh" ? "份" : "serving");
        const portion = weight != null ? metric(weight, "g", locale) : quantity != null ? metric(quantity, unit, locale) : textValue(item.amount) || "—";
        const calories = numberValue(item.calories);
        return <article className="nutrition-result-item" key={`${name}-${index}`} aria-label={name}>
          <header>
            <strong><FieldEditor field={nameField} label={locale === "zh" ? "食物名称" : "Food name"} fallback={name} editing={editing} onChange={onFieldChange} /></strong>
            <b><FieldEditor field={caloriesField} label={`${name}${locale === "zh" ? "热量" : " calories"}`} fallback={calories == null ? "—" : String(calories)} unit={locale === "zh" ? "千卡" : "kcal"} editing={editing} onChange={onFieldChange} /><small>{!editing || !caloriesField ? (locale === "zh" ? "千卡" : "kcal") : ""}</small></b>
          </header>
          <dl>
            <div><dt>{locale === "zh" ? "份量" : "Portion"}</dt><dd><FieldEditor field={portionField} label={`${name}${locale === "zh" ? "份量" : " portion"}`} fallback={portion} unit={amountField === portionField ? undefined : unit} editing={editing} onChange={onFieldChange} /></dd></div>
            <div><dt>{locale === "zh" ? "碳水" : "Carbs"}</dt><dd><FieldEditor field={carbohydrateField} label={`${name}${locale === "zh" ? "碳水" : " carbs"}`} fallback={metric(item.carbohydrate_grams ?? item.carbohydrateGrams, "g", locale)} unit="g" editing={editing} onChange={onFieldChange} /></dd></div>
            <div><dt>{locale === "zh" ? "蛋白质" : "Protein"}</dt><dd><FieldEditor field={proteinField} label={`${name}${locale === "zh" ? "蛋白质" : " protein"}`} fallback={metric(item.protein_grams ?? item.proteinGrams, "g", locale)} unit="g" editing={editing} onChange={onFieldChange} /></dd></div>
            <div><dt>{locale === "zh" ? "脂肪" : "Fat"}</dt><dd><FieldEditor field={fatField} label={`${name}${locale === "zh" ? "脂肪" : " fat"}`} fallback={metric(item.fat_grams ?? item.fatGrams, "g", locale)} unit="g" editing={editing} onChange={onFieldChange} /></dd></div>
          </dl>
        </article>;
      })}
    </div>

    <section className="nutrition-meal-total" aria-label={locale === "zh" ? "总计" : "Total"}>
      <h3>{locale === "zh" ? "总计" : "Total"}</h3>
      <dl>
        <div><dt>{locale === "zh" ? "热量" : "Calories"}</dt><dd>{metric(totalCalories, locale === "zh" ? "千卡" : "kcal", locale)}</dd></div>
        <div><dt>{locale === "zh" ? "碳水" : "Carbs"}</dt><dd>{metric(record.payload.carbohydrateGrams, "g", locale)}</dd></div>
        <div><dt>{locale === "zh" ? "蛋白质" : "Protein"}</dt><dd>{metric(record.payload.proteinGrams, "g", locale)}</dd></div>
        <div><dt>{locale === "zh" ? "脂肪" : "Fat"}</dt><dd>{metric(record.payload.fatGrams, "g", locale)}</dd></div>
      </dl>
    </section>
  </section>;
}
