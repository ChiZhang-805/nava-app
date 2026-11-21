"""Build a reproducible SQL import from the official USDA FNDDS download.

Usage: python scripts/prepare-food-references.py <zip> <output.sql>
Source: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip
USDA FoodData Central data are public domain. Never substitute branded recipes.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

# A small general reference set for a photo with no user-supplied food names.
# The complete searchable table still contains every nutrient-bearing entry.
PRIORITY = [2705894, 2707132, 2705824, 2705933, 2706018, 2707200,
            2706361, 2707476, 2708638, 2708830, 2709888, 2709890,
            2709664, 2709910, 2709803, 2709937, 2709645, 2709719,
            2709784, 2708404, 2708352, 2710180, 2707586, 2705385,
            2705418, 2705955, 2709887, 2709889, 2708825, 2710190,
            2707153, 2705934]

def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, (float, int)):
        assert value >= 0
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"

archive, output = map(Path, sys.argv[1:])
with zipfile.ZipFile(archive) as package:
    foods = json.loads(package.read('surveyDownload.json'))['SurveyFoods']
assert len(foods) == 5432, 'Unexpected release; review before importing'
rows = []
ids = set()
for food in foods:
    nutrients = {n['nutrient']['id']: n.get('amount') for n in food['foodNutrients']}
    macros = [nutrients.get(key) for key in (1008, 1003, 1005, 1004)]
    if all(value is None for value in macros):
        continue
    fdc_id = food['fdcId']
    assert fdc_id not in ids
    ids.add(fdc_id)
    portions = [{'description': p['portionDescription'], 'grams': p['gramWeight']}
                for p in food.get('foodPortions', []) if p.get('gramWeight', 0) > 0]
    priority = len(PRIORITY) - PRIORITY.index(fdc_id) if fdc_id in PRIORITY else 0
    values = [fdc_id, food['description'], food['dataType'], '2024-10-31', *macros,
              json.dumps(portions, ensure_ascii=False),
              f'https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients',
              'FNDDS 2021-2023 / 2024-10-31', priority]
    rows.append('(' + ','.join(map(literal, values)) + ')')
assert set(PRIORITY).issubset(ids)
columns = 'fdc_id,description,data_type,publication_date,calories_kcal,protein_g,carbohydrate_g,fat_g,portions,source_url,source_release,vision_priority'
updates = ','.join(f'{c}=excluded.{c}' for c in columns.split(',') if c != 'fdc_id')
sql = "begin; set local statement_timeout='90s';\n"
for start in range(0, len(rows), 400):
    sql += f'insert into public.food_composition_references ({columns}) values\n'
    sql += ',\n'.join(rows[start:start+400]) + f'\non conflict (fdc_id) do update set {updates};\n'
sql += 'commit;\n'
output.write_text(sql, encoding='utf8')
print(json.dumps({'release': 'FNDDS 2021-2023', 'foods': len(foods),
                  'imported': len(rows), 'defaultReferences': len(PRIORITY),
                  'zipSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}))
