"""Canonical items, markets and the alias rules that map ten years of CBSL spellings onto them."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Item:
    key: str
    name: str
    category: str  # vegetable | other | fruit | rice | fish
    unit: str  # kg | nut | ltr | each
    region: str | None  # weather region group, None for imported / non-crop items
    basket: bool = False  # part of the modelled eatery basket


ITEMS: list[Item] = [
    Item("beans", "Beans", "vegetable", "kg", "upcountry", True),
    Item("carrot", "Carrot", "vegetable", "kg", "upcountry", True),
    Item("cabbage", "Cabbage", "vegetable", "kg", "upcountry", True),
    Item("tomato", "Tomato", "vegetable", "kg", "dryzone", True),
    Item("brinjal", "Brinjal", "vegetable", "kg", "dryzone", True),
    Item("pumpkin", "Pumpkin", "vegetable", "kg", "dryzone", True),
    Item("snake_gourd", "Snake gourd", "vegetable", "kg", "dryzone", True),
    Item("green_chilli", "Green chilli", "vegetable", "kg", "dryzone", True),
    Item("lime", "Lime", "vegetable", "kg", "dryzone", True),
    Item("red_onion_local", "Red onion (local)", "other", "kg", "north", True),
    Item("red_onion_imp", "Red onion (imported)", "other", "kg", None),
    Item("big_onion_local", "Big onion (local)", "other", "kg", "dryzone", True),
    Item("big_onion_imp", "Big onion (imported)", "other", "kg", None, True),
    Item("potato_local", "Potato (local)", "other", "kg", "upcountry", True),
    Item("potato_imp", "Potato (imported)", "other", "kg", None, True),
    Item("dried_chilli_imp", "Dried chilli (imported)", "other", "kg", None, True),
    Item("coconut", "Coconut", "other", "nut", None, True),
    Item("coconut_oil", "Coconut oil", "other", "ltr", None),
    Item("red_dhal", "Red dhal", "other", "kg", None, True),
    Item("sugar_white", "Sugar (white)", "other", "kg", None),
    Item("egg_white", "Egg (white)", "other", "each", None),
    Item("katta_imp", "Katta (imported)", "other", "kg", None),
    Item("sprat_imp", "Sprat (imported)", "other", "kg", None),
    Item("banana_sour", "Banana (sour)", "fruit", "kg", "dryzone"),
    Item("papaw", "Papaw", "fruit", "kg", "dryzone"),
    Item("pineapple", "Pineapple", "fruit", "kg", None),
    Item("apple_imp", "Apple (imported)", "fruit", "each", None),
    Item("orange_imp", "Orange (imported)", "fruit", "each", None),
    Item("samba", "Samba rice", "rice", "kg", "dryzone", True),
    Item("nadu", "Nadu rice", "rice", "kg", "dryzone", True),
    Item("kekulu_white", "Kekulu rice (white)", "rice", "kg", "dryzone"),
    Item("kekulu_red", "Kekulu rice (red)", "rice", "kg", "dryzone"),
    Item("ponni_samba_imp", "Ponni samba (imported)", "rice", "kg", None),
    Item("nadu_imp", "Nadu (imported)", "rice", "kg", None),
    Item("kekulu_white_imp", "Kekulu white (imported)", "rice", "kg", None),
]
ITEMS_BY_KEY = {i.key: i for i in ITEMS}

FISH_NAMES = {"kelawalla", "thalapath", "balaya", "paraw", "salaya", "hurulla", "linna", "mullet", "seer"}

# normalised spelling -> item key, for spellings the generic rules below do not reach
_ALIASES = {
    "coconut avg": "coconut",
    "dhal": "red_dhal",
    "red dhal": "red_dhal",
    "mysore dhal": "red_dhal",
    "sugar": "sugar_white",
    "sugar white": "sugar_white",
    "egg": "egg_white",
    "egg white": "egg_white",
    "katta": "katta_imp",
    "sprat": "sprat_imp",
    "kekulu": "kekulu_white",
}

_PLURALS = {
    "tomatoes": "tomato", "onions": "onion", "potatoes": "potato", "chillies": "chilli", "chillie": "chilli",
    "eggs": "egg", "sprats": "sprat", "limes": "lime", "brinjals": "brinjal", "carrots": "carrot",
    "chilies": "chilli", "chili": "chilli", "imported": "imp", "lmp": "imp", "imp.": "imp",
}

MARKETS = {
    "pettah": "pettah",
    "dambulla": "dambulla",
    "narahenpita": "narahenpita",
    "marandagahamula": "marandagahamula",
    "maradagahamula": "marandagahamula",
    "peliyagoda": "peliyagoda",
    "negombo": "negombo",
}


def normalise_name(raw: str) -> str:
    s = raw.lower().replace("-", " ")
    s = re.sub(r"[().,/]", " ", s)
    words = [_PLURALS.get(w, w) for w in s.split()]
    return " ".join(words)


def item_key_for(raw: str) -> str | None:
    """Map a CBSL item label to a canonical key, or None if unknown."""
    norm = normalise_name(raw)
    if not norm:
        return None
    if norm.split()[0] in FISH_NAMES:
        return "fish:" + norm.split()[0]
    if norm in _ALIASES:
        return _ALIASES[norm]
    slug = norm.replace(" ", "_")
    if slug in ITEMS_BY_KEY:
        return slug
    # "kekulu white imp" -> kekulu_white_imp ; "nadu imp" -> nadu_imp handled above by slug
    return None


def market_key_for(raw: str) -> str | None:
    return MARKETS.get(raw.strip().lower().rstrip(":"))


def unit_for(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.lower().replace("rs", "").strip(" ./")
    s = s.replace(".", "").replace("/", "")
    return {"kg": "kg", "nut": "nut", "ltr": "ltr", "l": "ltr", "litre": "ltr", "each": "each", "egg": "each"}.get(s)
