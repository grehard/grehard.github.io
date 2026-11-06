// Store aisles, in the order a shopper walks them, and a best guess for where an ingredient lives.
Mise.Aisles = (() => {
  const LIST = ['Produce', 'Meat and fish', 'Dairy and eggs', 'Bakery', 'Pasta and grains', 'Canned and jarred', 'Baking', 'Oils and spices', 'Frozen', 'Other'];

  const KEYWORDS = {
    Produce: 'apple, arugula, avocado, banana, basil, beet, bell pepper, berry, blueberry, broccoli, cabbage, carrot, cauliflower, celery, cherry tomato, chive, cilantro, cucumber, dill, eggplant, fennel, garlic, ginger, green onion, jalapeno, kale, leek, lemon, lemon juice, lettuce, lime, lime juice, mint, mushroom, onion, orange, parsley, pear, pepper, potato, radish, red onion, rosemary, sage, shallot, spinach, squash, strawberry, sweet potato, thyme, tomato, zucchini',
    'Meat and fish': 'bacon, beef, chicken, chicken breast, chicken thigh, chuck, cod, ground beef, ground pork, ham, lamb, pork, prawn, salmon, sausage, shrimp, steak, stew beef, tuna, turkey',
    'Dairy and eggs': 'butter, buttermilk, cheddar, cheese, cream, cream cheese, egg, feta, goat cheese, greek yogurt, half-and-half, milk, mozzarella, parmesan, pecorino, ricotta, sour cream, yogurt',
    Bakery: 'bagel, baguette, bread, breadcrumb, ciabatta, corn tortilla, pita, roll, sourdough, sourdough bread, tortilla',
    'Pasta and grains': 'arborio rice, barley, bulgur, couscous, farro, jasmine rice, lasagna, noodle, oats, orzo, pasta, polenta, quinoa, rice, rigatoni, rolled oats, spaghetti',
    'Canned and jarred': 'anchovy, anchovy fillet, artichoke, bean, beef broth, black bean, broth, caper, capers, chicken broth, chickpea, coconut milk, crushed tomato, diced tomato, kidney bean, lentil, olive, peanut butter, pickle, red lentil, roasted red pepper, salsa, tahini, tomato paste, vegetable broth, white bean',
    Baking: 'almond, baking powder, baking soda, brown sugar, chocolate chip, cocoa, cornstarch, flour, honey, maple syrup, pecan, pine nut, powdered sugar, pumpkin seed, raisin, sugar, vanilla, vanilla extract, walnut, yeast',
    'Oils and spices': 'bay leaf, black pepper, canola oil, cardamom, cayenne, chili flake, chili powder, cinnamon, coriander, cumin, curry powder, dijon mustard, dried oregano, fish sauce, garam masala, mustard, nutmeg, oil, olive oil, oregano, paprika, red pepper flake, red wine vinegar, rice vinegar, salt, sesame oil, sherry vinegar, smoked paprika, soy sauce, toasted sesame oil, turmeric, vegetable oil, vinegar, worcestershire sauce',
    Frozen: 'frozen corn, frozen pea, frozen spinach, ice cream, pea',
    Other: 'coffee, coffee bean, dish soap, foil, paper towel, tea',
  };

  const LOOKUP = new Map();
  Object.entries(KEYWORDS).forEach(([aisle, text]) => {
    text.split(', ').forEach((keyword) => LOOKUP.set(keyword, aisle));
  });

  /** Longest run of words wins, so "olive oil" lands in oils even though "olive" is a jarred good. */
  function guess(name) {
    const words = Mise.Names.key(name).split(' ');
    for (let length = words.length; length > 0; length--) {
      for (let start = words.length - length; start >= 0; start--) {
        const hit = LOOKUP.get(words.slice(start, start + length).join(' '));
        if (hit) return hit;
      }
    }
    return 'Other';
  }

  return { LIST, guess };
})();
