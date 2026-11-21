import { foodReferencePrompt, foodReferenceQueries, loadFoodReferenceContext } from '../_shared/food-reference-context.ts';
import { dietRecognitionPrompt } from '../_shared/diet-prompt.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }

Deno.test('soup and cooking methods retrieve distinct composition references', () => {
  assert(foodReferenceQueries('排骨汤').includes('pork ribs'), 'Soup should look up edible ribs');
  assert(foodReferenceQueries('炸鸡腿').includes('chicken drumstick fried coated'), 'Fried coating changes composition');
  assert(!foodReferenceQueries('烤鸡').includes('chicken drumstick fried coated'), 'Do not use fried chicken for roast');
});

Deno.test('reference basis and unknown macros survive serialization', () => {
  const prompt = foodReferencePrompt([{fdc_id: 1,description: 'Soup',calories_kcal: 20,protein_g: null,carbohydrate_g: 0,fat_g: 1,portions:[{description:'cup',grams:240}]}]);
  assert(prompt.includes('PER 100 GRAMS'), 'Must distinguish 100 g from a plate');
  assert(prompt.includes('"protein":null') && prompt.includes('"carbs":0'), 'Unknown is not zero');
  assert(prompt.includes('"grams":240'), 'Preserve portion weight');
});

Deno.test('reference outages and deadlines preserve photo analysis', async () => {
  assert(await loadFoodReferenceContext({rpc: () => Promise.reject(Error('offline'))}) === '', 'Reject safely');
  assert(await loadFoodReferenceContext({rpc: () => new Promise(() => {})}, '', 5) === '', 'Bound waiting');
  const result = await loadFoodReferenceContext({rpc: (name,args) => {
    assert(name==='nava_food_reference_search' && args.p_limit===32, 'Bound database retrieval');
    return Promise.resolve({data: [],error:null});
  }},'排骨汤');
  assert(result==='', 'Empty database is optional evidence');
});

Deno.test('both language prompts preserve prepared dishes and personal share', () => {
  for (const lang of ['zh','en']) {
    const prompt = dietRecognitionPrompt(lang);
    for (const identity of ['排骨汤','麻辣烫','牛排','烤鸡','炸鸡腿']) assert(prompt.includes(identity),`Missing ${identity}`);
    assert(prompt.includes('one person') && prompt.includes('exclude bones'), 'Do not count a shared table or bones as intake');
  }
});
