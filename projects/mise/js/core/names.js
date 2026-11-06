// Ingredient names: singular and plural forms, and the key that decides when two
// differently worded lines ("All-purpose flour", "plain flour") are the same thing.
Mise.Names = (() => {
  const IRREGULAR = { leaves: 'leaf', loaves: 'loaf', halves: 'half' };
  const IRREGULAR_PLURAL = Object.fromEntries(Object.entries(IRREGULAR).map(([plural, one]) => [one, plural]));
  const KEEP_AS_IS = new Set(['oats', 'greens', 'grits', 'chives', 'molasses', 'couscous', 'hummus', 'asparagus', 'capers']);
  const MASS_NOUNS = new Set(['garlic', 'ginger', 'rice', 'butter', 'salt', 'sugar', 'flour', 'water', 'milk', 'spinach', 'kale', 'parsley', 'basil', 'cilantro', 'feta', 'parmesan', 'tofu', 'broccoli', 'celery']);

  const ALIASES = {
    'all-purpose flour': 'flour', 'all purpose flour': 'flour', 'plain flour': 'flour', 'ap flour': 'flour',
    'extra-virgin olive oil': 'olive oil', 'extra virgin olive oil': 'olive oil', evoo: 'olive oil',
    'kosher salt': 'salt', 'sea salt': 'salt', 'fine sea salt': 'salt', 'table salt': 'salt', 'flaky salt': 'salt',
    'ground black pepper': 'black pepper', 'ground pepper': 'black pepper', 'cracked black pepper': 'black pepper',
    scallion: 'green onion', 'spring onion': 'green onion', 'yellow onion': 'onion', 'brown onion': 'onion',
    'garlic clove': 'garlic', 'large egg': 'egg', 'unsalted butter': 'butter', 'salted butter': 'butter',
    'whole milk': 'milk', 'granulated sugar': 'sugar', 'white sugar': 'sugar', 'caster sugar': 'sugar',
    'light brown sugar': 'brown sugar', 'dark brown sugar': 'brown sugar',
    'parmesan cheese': 'parmesan', 'parmigiano-reggiano': 'parmesan', 'feta cheese': 'feta',
    'chicken stock': 'chicken broth', 'vegetable stock': 'vegetable broth', 'beef stock': 'beef broth',
    'garbanzo bean': 'chickpea', 'coriander leaf': 'cilantro',
  };

  function singularWord(word) {
    if (KEEP_AS_IS.has(word)) return word;
    if (IRREGULAR[word]) return IRREGULAR[word];
    if (/(ss|us|is)$/.test(word)) return word;
    if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
    if (/(ch|sh|x|z)es$/.test(word) || /(tomato|potato|mango)es$/.test(word)) return word.slice(0, -2);
    return word.endsWith('s') ? word.slice(0, -1) : word;
  }

  function pluralWord(word) {
    if (KEEP_AS_IS.has(word) || MASS_NOUNS.has(word)) return word;
    if (IRREGULAR_PLURAL[word]) return IRREGULAR_PLURAL[word];
    if (word === 'tomato' || word === 'potato') return `${word}es`;
    if (/(ch|sh|x|ss)$/.test(word)) return `${word}es`;
    if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
    return word.endsWith('s') ? word : `${word}s`;
  }

  function mapLastWord(name, change) {
    const words = name.split(' ');
    words[words.length - 1] = change(words[words.length - 1]);
    return words.join(' ');
  }

  /** Identity of an ingredient for combining and for matching the pantry. */
  function key(name) {
    const clean = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^fresh\s+/, '');
    const singular = mapLastWord(clean, singularWord);
    return ALIASES[singular] || ALIASES[clean] || singular;
  }

  /** The wording to show after merging: the shared name if an alias applied, otherwise as typed. */
  function display(name) {
    const clean = String(name || '').trim();
    return ALIASES[key(clean)] || (key(clean) !== mapLastWord(clean.toLowerCase(), singularWord) ? key(clean) : clean);
  }

  /** "egg" or "eggs" to agree with a bare count. */
  function forCount(name, qty) {
    const singular = mapLastWord(String(name || '').trim(), singularWord);
    return qty > 1 ? mapLastWord(singular, pluralWord) : singular;
  }

  /** True when every word the cook typed ("tomato") appears in the ingredient's key ("crushed tomato"). */
  function matches(typedKey, ingredientKey) {
    const words = ingredientKey.split(' ');
    return typedKey.split(' ').every((word) => words.includes(word));
  }

  return { key, display, forCount, matches };
})();
