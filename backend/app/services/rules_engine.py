"""Offline, deterministic complaint classifier (last provider in the AI chain; also supplies the danger scan that
severity escalation always uses, whichever provider classified the complaint).

Multilingual keyword lists: English, transliterated Kannada/Hindi/Tamil/Telugu/Malayalam (Latin script) and
native-script words. Matching is plain substring matching on the lower-cased text (ASCII terms must start at a
word boundary so that "light" does not match "flight"). Zero-width joiners are stripped from text and terms.

Keyword weights: 3 = specific phrase/word, 1 = weak/generic word. The lists are a starting point and are meant to be
extended; they are NOT a language model, which is why the certainty is deliberately modest and low certainty
triggers human review."""
import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

_ZW = re.compile("[​‌‍﻿]")

# --------------------------------------------------------------------------------------------------------------
# Keyword tables: (category, subcategory) -> (strong terms (weight 3), weak terms (weight 1))
# --------------------------------------------------------------------------------------------------------------
KEYWORDS: Dict[Tuple[str, str], Tuple[List[str], List[str]]] = {
    ("roads", "pothole"): (
        ["pothole", "pot hole", "hole in the road", "hole on the road", "gadda", "gaddha", "gundi", "gunta", "kuzhi",
         "ಗುಂಡಿ", "गड्ढा", "गड्ढे", "गढ्ढा", "குழி", "గుంత", "కుంట", "കുഴി"],
        ["pit"]),
    ("roads", "damaged_road"): (
        ["damaged road", "road damaged", "broken road", "road is broken", "road caved", "cave-in", "sinking road",
         "road cracked", "cracks on the road", "bad road", "road is bad", "sadak toot", "sadak kharab", "raste kharab",
         "road haalagide", "rasthe haalu", "speed breaker broken",
         "ರಸ್ತೆ ಹಾಳ", "ರಸ್ತೆ ಹದಗೆ", "ರಸ್ತೆ ಕುಸಿ", "सड़क टूट", "सड़क खराब", "सड़क धंस", "சாலை சேதம்", "சாலை மோசம்",
         "சாலை உடைந்த", "రోడ్డు పాడ", "రోడ్డు దెబ్బ", "റോഡ് തകർ", "റോഡ് മോശം"],
        []),
    ("roads", "broken_footpath"): (
        ["footpath", "foot path", "pavement", "sidewalk", "walkway", "paver", "tiles broken on footpath",
         "ಪಾದಚಾರಿ", "ಫುಟ್ ಪಾತ್", "ಫುಟ್ಪಾತ್", "फुटपाथ", "पटरी टूट", "நடைபாதை", "ఫుట్ పాత్", "ఫుట్పాత్", "కాలిబాట",
         "നടപ്പാത", "ഫുട്പാത്ത്"],
        []),
    ("waste", "overflowing_bin"): (
        ["overflowing bin", "bin overflow", "dustbin", "dust bin", "garbage bin", "bin is full", "bins are full",
         "dumpster", "overflowing garbage", "garbage overflow", "kasa dabbi", "kachra peti",
         "ಕಸದ ಡಬ್ಬಿ", "ಕಸದ ಬುಟ್ಟಿ", "ಕಸ ತುಂಬಿ", "कूड़ेदान", "कचरा पेटी", "कचरापेटी", "कूड़ा दान", "குப்பைத் தொட்டி",
         "குப்பை தொட்டி", "చెత్త డబ్బా", "చెత్త బుట్ట", "മാലിന്യ പെട്ടി", "മാലിന്യപ്പെട്ടി"],
        ["bin", "overflowing"]),
    ("waste", "litter"): (
        ["litter", "dumping", "dumped", "garbage", "trash", "rubbish", "waste", "kasa", "kachra", "kuppai", "kuppe",
         "chetta", "kooda", "garbage heap", "burning garbage", "ಕಸ", "कचरा", "कूड़ा", "குப்பை", "చెత్త", "മാലിന്യം",
         "ചവറ്"],
        ["dirty", "filth", "plastic", "stink", "smell", "swachh"]),
    ("waste", "missed_collection"): (
        ["not collected", "garbage not picked", "missed collection", "no pickup", "not been collected",
         "garbage truck", "garbage vehicle", "collection vehicle", "garbage van", "not cleared", "kasa tegedukondu",
         "kachra nahi uthaya", "kachra gaadi",
         "ಕಸ ಸಂಗ್ರಹ", "ಕಸ ತೆಗೆದುಕೊಂಡು", "ಕಸದ ಗಾಡಿ", "कचरा नहीं उठा", "कचरा गाड़ी", "कचरा नहीं", "குப்பை எடுக்க",
         "குப்பை வண்டி", "చెత్త తీసుకెళ్ల", "చెత్త బండి", "മാലിന്യം എടുത്തില്ല", "മാലിന്യ വണ്ടി"],
        ["collection", "pickup"]),
    ("water", "pipe_leak"): (
        ["pipe leak", "leaking pipe", "water leak", "pipeline burst", "burst pipe", "water pipe", "pipe burst",
         "pipe broken", "leakage", "water wasting", "water is wasting", "tap leaking", "main pipe", "neer leak",
         "pani leak", "paani leak", "pipe odedide", "pani beh", "paani beh",
         "ನೀರು ಸೋರಿಕೆ", "ಪೈಪ್ ಒಡೆ", "ಪೈಪ್ ಲೀಕ್", "ಸೋರಿಕೆ", "पाइप लीक", "पानी रिस", "पाइप फट", "पानी बह", "पाइप टूट",
         "குழாய் உடை", "தண்ணீர் கசிவு", "குழாய் கசிவு", "నీరు లీక్", "పైపు లీక్", "పైపు పగి", "నీళ్లు లీక్",
         "പൈപ്പ് പൊട്ടി", "വെള്ളം ചോർ", "ചോർച്ച"],
        ["leak", "pipe", "pipeline", "ಪೈಪ್", "पाइप", "குழாய்", "పైపు", "പൈപ്പ്"]),
    ("water", "water_shortage"): (
        ["no water", "water shortage", "water supply", "not getting water", "no supply", "water not coming",
         "tanker", "neer baralla", "neeru baralla", "neer barthilla", "paani nahi", "pani nahi", "paani nahin",
         "neer illa", "neeru illa", "water problem", "dry tap", "no tap water",
         "ನೀರು ಬರ್ತಿಲ್ಲ", "ನೀರು ಬರುತ್ತಿಲ್ಲ", "ನೀರು ಬರುವುದಿಲ್ಲ", "ನೀರಿನ ಸಮಸ್ಯೆ", "ನೀರು ಪೂರೈಕೆ", "ನೀರಿಲ್ಲ",
         "पानी नहीं आ", "पानी की कमी", "पानी की सप्लाई", "पानी नहीं", "पानी की समस्या", "தண்ணீர் வரவில்லை",
         "தண்ணீர் பற்றாக்குறை", "தண்ணீர் இல்லை", "నీళ్లు రావడం లేదు", "నీరు రావడం లేదు", "నీళ్లు రావట్లేదు",
         "വെള്ളം വരുന്നില്ല", "വെള്ളമില്ല"],
        ["supply"]),
    ("water", "contaminated_supply"): (
        ["contaminated", "dirty water", "muddy water", "smelly water", "brown water", "yellow water", "drinking water",
         "polluted water", "worms in water", "water smells", "tap water dirty", "kolaku neer", "ganda pani",
         "gande paani",
         "ಕೊಳಕು ನೀರು", "ಕಲುಷಿತ ನೀರು", "ಕಲುಷಿತ", "ಕುಡಿಯುವ ನೀರು", "गंदा पानी", "दूषित पानी", "पीने का पानी",
         "அசுத்த நீர்", "மாசுபட்ட நீர்", "அசுத்தமான தண்ணீர்", "குடிநீர்", "కలుషిత నీరు", "మురికి నీరు", "తాగునీరు",
         "കലങ്ങിയ വെള്ളം", "കുടിവെള്ളം", "മലിനമായ വെള്ളം"],
        []),
    ("water", "sewage_overflow"): (
        ["sewage", "sewer overflow", "sewer water", "overflowing sewer", "manhole overflow", "drainage overflow",
         "stinking water on road", "sewerage", "sewer line overflow", "drain water on road", "ogaduthide",
         "ಒಳಚರಂಡಿ ಉಕ್ಕ", "ಒಳಚರಂಡಿ", "ಮಲ", "सीवेज", "सीवर ओवरफ्लो", "सीवर का पानी", "सीवर उफन", "கழிவு நீர்",
         "கழிவுநீர்", "సీవేజ్", "మురుగు", "డ్రైనేజీ పొంగ", "മലിനജലം", "സീവേജ്", "മലിന ജലം"],
        ["overflow"]),
    ("water", "sewer_blockage"): (
        ["sewer block", "sewer choke", "blocked sewer", "choked sewer", "sewage line blocked", "sewer jam",
         "underground drainage block", "ug drain block", "sewer is blocked", "sewage block", "choked",
         "ಒಳಚರಂಡಿ ಕಟ್ಟಿ", "ಒಳಚರಂಡಿ ಬ್ಲಾಕ್", "सीवर जाम", "सीवर बंद", "सीवर ब्लॉक", "கழிவுநீர் அடைப்பு",
         "பாதாள சாக்கடை அடைப்பு", "మురుగు పూడిక", "డ్రైనేజీ బ్లాక్", "సీవర్ బ్లాక్", "സീവർ അടഞ്ഞ", "സീവേജ് അടഞ്ഞ"],
        []),
    ("electricity", "broken_streetlight"): (
        ["streetlight", "street light", "street lamp", "lamp post", "lamppost", "light not working",
         "lights not working", "light is off", "lights are off", "no light", "dark street", "dark road",
         "street is dark", "bulb", "light pole", "beedi deepa", "street lite", "light band", "batti band",
         "ಬೀದಿ ದೀಪ", "ದೀಪ ಉರಿ", "ಲೈಟ್ ಇಲ್ಲ", "ಲೈಟ್ ಕೆಟ್ಟ", "ಬೀದಿ ದೀಪಗಳು", "स्ट्रीट लाइट", "सड़क की बत्ती", "बत्ती बंद",
         "लाइट बंद", "बत्ती खराब", "தெரு விளக்கு", "விளக்கு எரிய", "தெருவிளக்கு", "వీధి దీపం", "వీధి దీపాలు",
         "వీధి లైట్", "തെരുവ് വിളക്ക്", "തെരുവുവിളക്ക്", "വിളക്ക് കത്ത"],
        ["light", "lights", "dark", "ಲೈಟ್", "बत्ती", "लाइट", "விளக்கு", "వీధి", "വിളക്ക്", "ದೀಪ"]),
    ("electricity", "exposed_wiring"): (
        ["exposed wire", "live wire", "wire fallen", "fallen wire", "wires fallen", "hanging wire", "loose wire",
         "wires hanging", "cable hanging", "broken cable", "electric wire", "sparking", "sparks", "electric shock",
         "electrocut", "snapped wire", "wire on road", "wire on the road", "short circuit", "naked wire",
         "open wire", "current wire", "tar tutu", "taar", "karent taar",
         "ವಿದ್ಯುತ್ ತಂತಿ", "ತಂತಿ ತುಂಡ", "ತಂತಿ ಬಿದ್ದ", "ಕಿಡಿ", "ಶಾಕ್", "बिजली का तार", "तार टूट", "तार लटक", "करंट",
         "चिंगारी", "शॉर्ट सर्किट", "खुला तार", "மின்கம்பி", "மின் கம்பி", "மின்கம்பி அறுந்த",
         "தீப்பொறி", "மின் அதிர்ச்சி", "విద్యుత్ తీగ", "కరెంట్ తీగ", "తెగిన వైర్", "షాక్", "വൈദ്യുതി കമ്പി",
         "ഷോക്ക്", "തീപ്പൊരി", "പൊട്ടിവീണ"],
        ["wire", "wires", "cable", "cables", "ತಂತಿ", "तार", "கம்பி", "వైర్", "తీగ", "കമ്പി", "വയർ"]),
    ("electricity", "power_outage"): (
        ["power cut", "power outage", "no power", "no electricity", "no current", "current illa", "current ilde",
         "current hogide", "current nahi", "bijli nahi", "bijli gul", "bijli cut", "load shedding", "blackout",
         "power failure", "power not coming", "electricity not", "voltage", "light gone", "power went",
         "ವಿದ್ಯುತ್ ಕಡಿತ", "ಕರೆಂಟ್ ಇಲ್ಲ", "ಕರೆಂಟ್ ಹೋ", "ವಿದ್ಯುತ್ ಇಲ್ಲ", "बिजली नहीं", "बिजली गुल", "बिजली कट",
         "बिजली चली गई", "மின்சாரம் இல்லை", "மின்வெட்டு", "மின் தடை", "కరెంటు లేదు", "కరెంట్ లేదు", "కరెంటు పోయ",
         "విద్యుత్ లేదు", "విద్యుత్ అంతరాయం", "വൈദ്യുതി ഇല്ല", "കറന്റ് ഇല്ല",
         "വൈദ്യുതി മുടങ്ങി", "കറന്റ് പോയി"],
        ["current", "electricity", "electric", "power", "transformer", "ಕರೆಂಟ್", "ವಿದ್ಯುತ್", "बिजली", "மின்சாரம்",
         "కరెంట్", "కరెంటు", "విద్యుత్", "വൈദ്യുതി", "കറന്റ്"]),
    ("electricity", "damaged_electric_asset"): (
        ["electric pole", "electricity pole", "pole broken", "pole leaning", "pole fallen", "pole tilted",
         "transformer damaged", "transformer burst", "transformer blast", "meter box", "distribution box",
         "junction box", "feeder pillar", "electric box", "karent kamba",
         "ವಿದ್ಯುತ್ ಕಂಬ", "ಕಂಬ ಬಾಗಿ", "ಕಂಬ ಬಿದ್ದ", "बिजली का खंभा", "खंभा टूट", "खंभा झुक", "மின் கம்பம்", "மின்கம்பம்",
         "கம்பம் சாய்ந்த", "కరెంట్ స్తంభం", "విద్యుత్ స్తంభం", "స్తంభం", "വൈദ്യുതി തൂൺ", "വൈദ്യുത തൂൺ", "പോസ്റ്റ് ചരിഞ്ഞ"],
        ["pole", "ಕಂಬ", "खंभा", "கம்பம்", "തൂൺ"]),
    ("trees", "fallen_tree"): (
        ["fallen tree", "tree fell", "tree has fallen", "tree fallen", "tree collapsed", "uprooted", "tree blocking",
         "tree on road", "tree down", "tree fall", "tree is lying", "mara biddide", "mara bidditu", "mara buddide",
         "mara kuseede", "ped gir", "ped gira", "ped ukhad",
         "ಮರ ಬಿದ್ದ", "ಮರ ಉರುಳ", "ಮರ ಮುರಿದು", "पेड़ गिर", "पेड़ उखड़", "पेड़ टूट", "மரம் விழுந்த", "மரம் சாய்ந்த",
         "மரம் முறிந்த", "చెట్టు కూలి", "చెట్టు పడి", "చెట్టు విరిగి", "മരം വീണ", "മരം മറിഞ്ഞ", "മരം ഒടിഞ്ഞ"],
        ["tree", "mara", "ped", "ಮರ", "पेड़", "மரம்", "చెట్టు", "മരം"]),
    ("trees", "dangerous_branch"): (
        ["dangerous branch", "hanging branch", "dry branch", "broken branch", "tree trimming", "pruning", "overgrown",
         "branch about to fall", "branches touching", "tree branch", "branches", "branch", "kombe", "rembe", "daali",
         "ಕೊಂಬೆ", "ರೆಂಬೆ", "टहनी", "डाली", "टहनियां", "கிளை", "கிளைகள்", "కొమ్మ", "కొమ్మలు", "ശിഖരം", "ചില്ല"],
        ["trim"]),
    ("trees", "park_maintenance"): (
        ["park", "garden", "playground", "lawn", "swing", "jogging track", "park not maintained", "children's park",
         "ಉದ್ಯಾನ", "ಪಾರ್ಕ್", "उद्यान", "पार्क", "बगीचा", "பூங்கா", "పార్క్", "ఉద్యానవనం", "പാർക്ക്", "പൂന്തോട്ടം"],
        []),
    ("drainage", "blocked_drain"): (
        ["blocked drain", "drain blocked", "clogged drain", "choked drain", "storm drain", "stormwater",
         "drain choked", "drain is blocked", "gutter", "nala", "nalla", "silt", "drain clogged", "naali jam",
         "ಚರಂಡಿ ಕಟ್ಟಿ", "ಚರಂಡಿ", "ಮೋರಿ", "ರಾಜಕಾಲುವೆ", "नाली जाम", "नाली", "नाला", "गटर", "வடிகால் அடைப்பு",
         "வடிகால்", "கால்வாய்", "కాలువ", "డ్రైనేజీ", "ഓട അടഞ്ഞ", "ഓട"],
        ["drain", "drainage"]),
    ("drainage", "flooding"): (
        ["flood", "flooded", "flooding", "waterlogging", "waterlogged", "water logging", "water stagnation",
         "water stagnant", "knee deep water", "rain water", "rainwater", "inundated", "water standing",
         "water is standing", "water stagnating", "road under water",
         "ಪ್ರವಾಹ", "ನೀರು ನಿಂತ", "ಜಲಾವೃತ", "ಮಳೆ ನೀರು", "बाढ़", "जलभराव", "पानी भर", "बारिश का पानी", "வெள்ளம்",
         "தண்ணீர் தேங்கி", "நீர் தேங்கி", "వర్షపు నీరు", "వరద", "నీరు నిలిచి", "నీళ్లు నిలిచి",
         "വെള്ളപ്പൊക്കം", "വെള്ളക്കെട്ട്", "വെള്ളം കെട്ടി"],
        []),
    ("drainage", "open_drain"): (
        ["open drain", "uncovered drain", "drain cover missing", "drain slab", "open nala", "open gutter",
         "slab broken", "drain without cover", "drain open", "uncovered gutter",
         "ತೆರೆದ ಚರಂಡಿ", "ಮುಚ್ಚಳ ಇಲ್ಲದ ಚರಂಡಿ", "ತೆರೆದ ಮೋರಿ", "खुली नाली", "खुला नाला", "नाली का ढक्कन", "திறந்த வடிகால்",
         "திறந்த கால்வாய்", "తెరిచిన కాలువ", "తెరిచి ఉన్న కాలువ", "തുറന്ന ഓട", "ഓട തുറന്ന"],
        []),
    ("drainage", "open_manhole"): (
        ["manhole", "man hole", "man-hole", "manhole cover", "open manhole", "missing cover", "cover missing",
         "lid missing", "manhole lid", "ಮ್ಯಾನ್ ಹೋಲ್", "ಮ್ಯಾನ್ಹೋಲ್", "ಮ್ಯಾನ್‌ಹೋಲ್", "मैनहोल", "मेनहोल", "ढक्कन गायब",
         "மேன்ஹோல்", "மேன் ஹோல்", "మ్యాన్హోల్", "మ్యాన్ హోల్", "മാൻഹോൾ", "മാൻ ഹോൾ"],
        []),
    ("public_infrastructure", "damaged_bench"): (
        ["bench", "seat broken", "broken seat", "seating", "ಬೆಂಚ್", "बेंच", "पार्क की बेंच", "பெஞ்ச்", "బెంచ్",
         "ബെഞ്ച്"],
        []),
    ("public_infrastructure", "bus_shelter"): (
        ["bus shelter", "bus shed", "bus stand roof", "bus shelter roof", "bus stop shelter", "ಬಸ್ ತಂಗುದಾಣ",
         "ಬಸ್ ಶೆಲ್ಟರ್", "बस शेल्टर", "बस स्टॉप की छत", "பேருந்து நிழற்குடை", "బస్ షెల్టర్", "ബസ് ഷെൽട്ടർ"],
        ["bus stop", "bus stand", "ಬಸ್ ನಿಲ್ದಾಣ", "ಬಸ್ ಸ್ಟಾಪ್", "बस स्टॉप", "बस अड्डा", "பேருந்து நிறுத்தம்",
         "பஸ் ஸ்டாப்", "బస్ స్టాప్", "బస్టాండ్", "ബസ് സ്റ്റോപ്പ്", "ബസ് സ്റ്റാൻഡ്"]),
    ("public_infrastructure", "public_toilet"): (
        ["public toilet", "toilet", "washroom", "restroom", "urinal", "sulabh", "community toilet",
         "ಶೌಚಾಲಯ", "शौचालय", "सुलभ", "கழிவறை", "கழிப்பறை", "మరుగుదొడ్డి", "టాయిలెట్", "ശുചിമുറി", "ടോയ്ലറ്റ്"],
        []),
    ("public_infrastructure", "other_asset"): (
        ["public property", "signboard", "sign board", "street sign", "road sign", "name board", "railing", "statue",
         "compound wall", "bollard", "fence broken", "bus stop board", "ಫಲಕ", "ಸೂಚನಾ ಫಲಕ", "साइन बोर्ड", "रेलिंग",
         "பலகை", "బోర్డు", "ബോർഡ്"],
        []),
}

# generic category words (weight 1, counted for the category only, never for a subcategory)
CATEGORY_GENERIC: Dict[str, List[str]] = {
    "roads": ["road", "street", "rasta", "raste", "rasthe", "sadak", "ರಸ್ತೆ", "सड़क", "सडक", "சாலை", "ரோடு", "రోడ్డు", "റോഡ്"],
    "waste": ["garbage", "waste", "sanitation", "swachh", "ಕಸ", "कचरा", "குப்பை", "చెత్త", "മാലിന്യം"],
    "water": ["water", "neer", "neeru", "pani", "paani", "tap", "bwssb", "ನೀರು", "पानी", "தண்ணீர்", "நீர்", "నీరు",
              "నీళ్లు", "വെള്ളം", "ജലം"],
    "electricity": ["electric", "bescom", "current", "power", "ವಿದ್ಯುತ್", "बिजली", "மின்", "విద్యుత్", "വൈദ്യുതി"],
    "trees": ["tree", "tree", "plant", "ಮರ", "पेड़", "மரம்", "చెట్టు", "മരം"],
    "drainage": ["drain", "drainage", "nala", "ಚರಂಡಿ", "नाली", "வடிகால்", "కాలువ", "ഓട"],
    "public_infrastructure": ["public", "bus", "shelter", "toilet"],
}

# --------------------------------------------------------------------------------------------------------------
# Factor baselines (safety_risk, public_impact, issue_scale, location_sensitivity, duration), all 0-100
# --------------------------------------------------------------------------------------------------------------
BASE_FACTORS: Dict[Tuple[str, str], Tuple[int, int, int, int, int]] = {
    ("roads", "pothole"): (35, 35, 25, 20, 10),
    ("roads", "damaged_road"): (35, 40, 35, 20, 10),
    ("roads", "broken_footpath"): (25, 30, 25, 20, 10),
    ("waste", "overflowing_bin"): (15, 30, 25, 20, 10),
    ("waste", "litter"): (10, 25, 20, 20, 10),
    ("waste", "missed_collection"): (10, 35, 30, 15, 10),
    ("water", "pipe_leak"): (20, 35, 30, 20, 10),
    ("water", "water_shortage"): (25, 50, 45, 20, 10),
    ("water", "contaminated_supply"): (50, 50, 40, 20, 10),
    ("water", "sewage_overflow"): (40, 45, 35, 25, 10),
    ("water", "sewer_blockage"): (30, 40, 30, 20, 10),
    ("electricity", "broken_streetlight"): (28, 30, 20, 25, 10),
    ("electricity", "exposed_wiring"): (75, 50, 30, 30, 10),
    ("electricity", "power_outage"): (25, 50, 45, 20, 10),
    ("electricity", "damaged_electric_asset"): (50, 40, 30, 25, 10),
    ("trees", "fallen_tree"): (50, 55, 35, 25, 10),
    ("trees", "dangerous_branch"): (40, 30, 20, 20, 10),
    ("trees", "park_maintenance"): (5, 20, 20, 15, 10),
    ("drainage", "blocked_drain"): (20, 35, 30, 20, 10),
    ("drainage", "flooding"): (40, 55, 45, 25, 10),
    ("drainage", "open_drain"): (35, 30, 20, 25, 10),
    ("drainage", "open_manhole"): (60, 40, 15, 30, 10),
    ("public_infrastructure", "damaged_bench"): (10, 15, 15, 15, 10),
    ("public_infrastructure", "bus_shelter"): (15, 30, 20, 25, 10),
    ("public_infrastructure", "public_toilet"): (15, 35, 25, 20, 10),
    ("public_infrastructure", "other_asset"): (10, 20, 20, 15, 10),
    ("other", "other"): (10, 20, 20, 15, 10),
}
DEFAULT_FACTORS = (15, 25, 20, 15, 10)

# --------------------------------------------------------------------------------------------------------------
# Modifiers that raise factors: (terms, {factor: +delta}, driver phrase for the one-line reason)
# --------------------------------------------------------------------------------------------------------------
MODIFIERS: List[Tuple[List[str], Dict[str, int], str]] = [
    (["deep", "huge", "massive", "very large", "very big", "gigantic", "big ", "large ", "ತುಂಬಾ ದೊಡ್ಡ", "ದೊಡ್ಡ",
      "बहुत बड़ा", "बड़ा", "बहुत गहरा", "गहरा", "பெரிய", "ஆழமான", "పెద్ద", "లోతైన", "വലിയ", "ആഴമുള്ള", "bahut bada",
      "ತುಂಬಾ ಆಳ", "ಆಳವಾದ"],
     {"issue_scale": 30, "safety_risk": 10}, "large/deep"),
    (["near school", "near a school", "near the school", "school", "college", "hospital", "clinic", "temple",
      "mosque", "church", "junction", "main road", "highway", "flyover", "metro", "crossing", "ಶಾಲೆ", "ಆಸ್ಪತ್ರೆ",
      "विद्यालय", "स्कूल", "अस्पताल", "பள்ளி", "மருத்துவமனை", "పాఠశాల", "స్కూల్", "ఆసుపత్రి", "സ്കൂൾ", "ആശുപത്രി"],
     {"location_sensitivity": 45, "safety_risk": 5, "public_impact": 10}, "near a sensitive location"),
    (["bus stop", "bus stand", "bus shelter", "market", "crowded", "busy", "footfall", "pedestrian", "ಬಸ್ ನಿಲ್ದಾಣ",
      "बस स्टॉप", "बाजार", "பேருந்து நிறுத்தம்", "బస్ స్టాప్", "ബസ് സ്റ്റോപ്പ്"],
     {"location_sensitivity": 35, "public_impact": 15}, "busy public spot"),
    (["children", "child", "kids", "elderly", "old people", "senior citizen", "pregnant", "disabled", "wheelchair",
      "ಮಕ್ಕಳು", "ಮಗು", "ವೃದ್ಧರು", "बच्चे", "बच्चों", "बुजुर्ग", "குழந்தைகள்", "குழந்தை", "முதியவர்", "పిల్లలు",
      "వృద్ధులు", "കുട്ടികൾ", "കുട്ടി", "വയോധിക"],
     {"safety_risk": 15, "location_sensitivity": 20}, "children/elderly at risk"),
    (["accident", "injur", "hurt", "fell down", "fall down", "slipped", "skid", "bike fell", "collision", "crash",
      "ಅಪಘಾತ", "ಗಾಯ", "दुर्घटना", "हादसा", "चोट", "விபத்து", "காயம்", "ప్రమాదం", "గాయం", "അപകടം", "പരിക്ക്"],
     {"safety_risk": 30, "public_impact": 10}, "accident/injury reported"),
    (["sparking", "live wire", "electrocut", "electric shock", "got shock", "high voltage", "short circuit",
      "gas leak", "smell of gas", "gas smell", "ಕಿಡಿ", "ಶಾಕ್", "चिंगारी", "करंट", "தீப்பொறி", "షాక్", "ഷോക്ക്"],
     {"safety_risk": 90, "public_impact": 15}, "possible live electrical hazard"),
    (["fallen on", "fell on", "blocked road", "road blocked", "blocking road", "blocking the road", "road is blocked",
      "traffic jam", "blocking traffic", "no vehicles can pass", "vehicles cannot pass", "ರಸ್ತೆ ಬಂದ್", "सड़क बंद",
      "रास्ता बंद", "சாலை மூடப்பட்ட", "రోడ్డు బ్లాక్", "റോഡ് തടസ്സ"],
     {"public_impact": 30, "safety_risk": 15, "issue_scale": 15}, "road blocked"),
    (["flooded", "flooding", "knee deep", "waist deep", "road under water", "ಜಲಾವೃತ", "जलभराव", "வெள்ளம்",
      "వరద", "വെള്ളപ്പൊക്കം"],
     {"issue_scale": 25, "public_impact": 20}, "flooded"),
    (["many", "whole street", "entire street", "entire area", "whole area", "everyone", "colony", "residents",
      "neighbours", "neighbors", "several houses", "all houses", "apartment", "layout", "ಇಡೀ", "ಎಲ್ಲರೂ", "ಬಡಾವಣೆ",
      "पूरी गली", "पूरे इलाके", "सभी लोग", "कॉलोनी", "முழு தெரு", "அனைவரும்", "ఇళ్లు అన్ని", "കോളനി", "എല്ലാവരും"],
     {"public_impact": 20, "issue_scale": 20}, "affects many residents"),
    (["night", "after dark", "at night", "ರಾತ್ರಿ", "रात", "இரவு", "రాత్రి", "രാത്രി"],
     {"safety_risk": 8, "location_sensitivity": 5}, "worse at night"),
    (["emergency", "urgent", "immediately", "dangerous", "danger", "risk", "life", "ತುರ್ತು", "ಅಪಾಯ", "ಅಪಾಯಕಾರಿ",
      "खतरा", "खतरनाक", "तुरंत", "அபாயம்", "ஆபத்து", "அவசர", "ప్రమాదకరం", "అత్యవసర", "അപകടകരം", "അടിയന്തര"],
     {"safety_risk": 15}, "described as dangerous/urgent"),
]

# --------------------------------------------------------------------------------------------------------------
# Danger scan (credible immediate danger). `LIFE_DANGER` = explicit danger to life -> critical.
# --------------------------------------------------------------------------------------------------------------
DANGER_TERMS = [
    "live wire", "exposed wire", "fallen wire", "wire fallen", "wires fallen", "hanging wire", "wires hanging",
    "snapped wire", "naked wire", "open wire", "sparking", "sparks", "electric shock", "shock", "electrocut",
    "short circuit", "gas leak", "gas smell", "smell of gas", "smells of gas", "tree on power line",
    "tree on the power line", "tree fell on", "tree fallen on", "pole fell", "pole fallen", "pole collapsed",
    "transformer blast", "transformer burst", "fire", "collapse", "fallen on", "wire on road", "wire on the road",
    "cable hanging", "building leaning", "caved in", "sinkhole", "sink hole",
    "ಕಿಡಿ", "ಶಾಕ್", "ಪ್ರಾಣಾಪಾಯ", "ವಿದ್ಯುತ್ ತಂತಿ ಬಿದ್ದ", "ತಂತಿ ಬಿದ್ದ", "ತಂತಿ ತುಂಡ", "ಬೆಂಕಿ",
    "करंट", "चिंगारी", "जानलेवा", "तार गिर", "तार लटक", "खुला तार", "बिजली का तार टूट", "आग", "शॉर्ट सर्किट", "गैस रिसाव",
    "தீப்பொறி", "மின் அதிர்ச்சி", "மின்கம்பி அறுந்த", "மின் கம்பி அறுந்த", "தீ விபத்து", "எரிவாயு கசிவு",
    "షాక్", "నిప్పు", "విద్యుత్ తీగ తెగి", "తెగిన వైర్", "గ్యాస్ లీక్", "ഷോക്ക്", "തീപ്പൊരി", "തീപിടിത്തം", "പൊട്ടിവീണ",
]
LIFE_DANGER_TERMS = [
    "live wire", "sparking", "sparks", "electrocut", "electric shock", "got shock", "gas leak", "gas smell",
    "smell of gas", "smells of gas", "fire", "collapse", "died", "death", "dead", "killed", "drown", "fell into",
    "child fell", "children fell", "tree fell on", "tree fallen on", "transformer blast", "pole fell on",
    "ಕಿಡಿ", "ಶಾಕ್", "ಪ್ರಾಣಾಪಾಯ", "ಬೆಂಕಿ", "करंट लग", "चिंगारी", "जानलेवा", "आग", "गैस रिसाव", "मौत", "मर गया",
    "தீப்பொறி", "மின் அதிர்ச்சி", "தீ விபத்து", "எரிவாயு கசிவு", "షాక్", "నిప్పు", "గ్యాస్ లీక్", "ഷോക്ക്",
    "തീപ്പൊരി", "തീപിടിത്തം",
]
OPEN_WORDS = ["open", "uncovered", "missing", "no cover", "without cover", "without lid", "lid missing", "broken cover",
              "ತೆರೆದ", "ಮುಚ್ಚಳ ಇಲ್ಲ", "खुला", "खुले", "ढक्कन नहीं", "ढक्कन गायब", "திறந்த", "மூடி இல்லை", "తెరిచి",
              "మూత లేదు", "തുറന്ന", "മൂടി ഇല്ല"]
MANHOLE_WORDS = ["manhole", "man hole", "man-hole", "ಮ್ಯಾನ್ ಹೋಲ್", "ಮ್ಯಾನ್ಹೋಲ್", "मैनहोल", "மேன்ஹோல்", "మ్యాన్హోల్",
                 "മാൻഹോൾ"]
FLOOD_WORDS = ["flood", "waterlog", "water logging", "inundat", "ಪ್ರವಾಹ", "जलभराव", "बाढ़", "வெள்ளம்", "వరద",
               "വെള്ളപ്പൊക്കം", "വെള്ളക്കെട്ട്"]
ELECTRIC_WORDS = ["wire", "electric", "current", "power", "pole", "cable", "transformer", "ತಂತಿ", "ವಿದ್ಯುತ್", "ಕರೆಂಟ್",
                  "तार", "बिजली", "करंट", "खंभा", "மின்", "కరెంట్", "విద్యుత్", "വൈദ്യുതി", "കറന്റ്"]
TREE_BLOCK_WORDS = ["blocking", "blocked", "on road", "on the road", "across the road", "on wire", "on the wire",
                    "on power line", "on electric"]

# Short English risk phrase per subcategory, used to build the one-line reason.
RISK_BLURB: Dict[Tuple[str, str], str] = {
    ("roads", "pothole"): "risk of falls and vehicle damage",
    ("roads", "damaged_road"): "risk to road users and vehicles",
    ("roads", "broken_footpath"): "trip hazard for pedestrians",
    ("waste", "overflowing_bin"): "unhygienic and may spread litter",
    ("waste", "litter"): "sanitation and cleanliness concern",
    ("waste", "missed_collection"): "uncollected waste may build up",
    ("water", "pipe_leak"): "water being wasted, possible road damage",
    ("water", "water_shortage"): "households affected by lack of supply",
    ("water", "contaminated_supply"): "possible health risk from unsafe water",
    ("water", "sewage_overflow"): "health and hygiene risk from sewage",
    ("water", "sewer_blockage"): "sewer backup may affect surroundings",
    ("electricity", "broken_streetlight"): "poor visibility and personal-safety concern after dark",
    ("electricity", "exposed_wiring"): "possible electric shock hazard",
    ("electricity", "power_outage"): "supply interruption affecting residents",
    ("electricity", "damaged_electric_asset"): "damaged electrical equipment may be hazardous",
    ("trees", "fallen_tree"): "obstruction and possible damage",
    ("trees", "dangerous_branch"): "branch may fall on people or property",
    ("trees", "park_maintenance"): "public space needs upkeep",
    ("drainage", "blocked_drain"): "water may back up onto the road",
    ("drainage", "flooding"): "waterlogging disrupts movement and may be unsafe",
    ("drainage", "open_drain"): "risk of falls into an uncovered drain",
    ("drainage", "open_manhole"): "risk of people or vehicles falling in",
    ("public_infrastructure", "damaged_bench"): "damaged public seating",
    ("public_infrastructure", "bus_shelter"): "commuters left without proper shelter",
    ("public_infrastructure", "public_toilet"): "public sanitation facility needs attention",
    ("public_infrastructure", "other_asset"): "public asset needs repair",
    ("other", "other"): "needs manual triage",
}

FACTOR_NAMES = ("safety_risk", "public_impact", "issue_scale", "location_sensitivity", "duration")

# --------------------------------------------------------------------------------------------------------------
# Language / script detection
# --------------------------------------------------------------------------------------------------------------
_SCRIPT_RANGES = [
    ("hi", 0x0900, 0x097F),   # Devanagari
    ("te", 0x0C00, 0x0C7F),
    ("kn", 0x0C80, 0x0CFF),
    ("ta", 0x0B80, 0x0BFF),
    ("ml", 0x0D00, 0x0D7F),
]
SUPPORTED_LANGS = ("en", "hi", "kn", "ta", "te", "ml")


def detect_script_language(text: str) -> Optional[str]:
    """Return the language code of the dominant non-Latin script (>=40 % of letters), else None."""
    counts: Dict[str, int] = {}
    letters = 0
    for ch in text:
        if not ch.isalpha():
            continue
        letters += 1
        o = ord(ch)
        for code, lo, hi in _SCRIPT_RANGES:
            if lo <= o <= hi:
                counts[code] = counts.get(code, 0) + 1
                break
    if not letters or not counts:
        return None
    code, n = max(counts.items(), key=lambda kv: kv[1])
    return code if n / letters >= 0.4 else None


def detect_language(text: str, given: Optional[str] = None) -> str:
    """Selected language wins, unless the text is clearly written in another supported non-Latin script."""
    given = given if given in SUPPORTED_LANGS else None
    script = detect_script_language(text or "")
    if script and script != given:
        return script
    return given or "en"


# --------------------------------------------------------------------------------------------------------------
# Matching helpers
# --------------------------------------------------------------------------------------------------------------
def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", _ZW.sub("", (text or "").lower())).strip()


_PATTERN_CACHE: Dict[str, "re.Pattern[str]"] = {}


def _has(text: str, term: str) -> bool:
    term = normalise(term)
    if not term:
        return False
    if term.isascii():
        pat = _PATTERN_CACHE.get(term)
        if pat is None:
            pat = re.compile(r"(?<![a-z0-9])" + re.escape(term.strip()))
            _PATTERN_CACHE[term] = pat
        return pat.search(text) is not None
    return term in text


def _any(text: str, terms: List[str]) -> bool:
    return any(_has(text, t) for t in terms)


def detect_danger(text: str) -> Tuple[bool, bool, List[str]]:
    """Return (danger, life_danger, matched_terms). Deterministic, works on any provider's input text."""
    t = normalise(text)
    matched = [x for x in DANGER_TERMS if _has(t, x)]
    life = any(_has(t, x) for x in LIFE_DANGER_TERMS)
    if _any(t, MANHOLE_WORDS) and _any(t, OPEN_WORDS):
        matched.append("open manhole")
    if _any(t, FLOOD_WORDS) and _any(t, ELECTRIC_WORDS):
        matched.append("flooding near electricity")
        life = life or _has(t, "electric") or _has(t, "wire")
    if _has(t, "tree") and _any(t, ["power line", "electric wire", "on wire", "on the wire"]):
        matched.append("tree on power line")
    if _any(t, ["tree fell", "tree fallen", "fallen tree", "tree down", "uprooted"]) and _any(t, TREE_BLOCK_WORDS):
        matched.append("tree blocking road")
    return bool(matched), life, matched


def _duration_score(text: str) -> int:
    best = 0
    unit_days = (
        (30.0, ["month", "mahine", "tingalu", "ತಿಂಗಳ", "महीन", "மாத", "నెల", "മാസ"]),
        (7.0, ["week", "hafte", "hafta", "vaara", "ವಾರ", "हफ्त", "सप्ताह", "வார", "వార", "ആഴ്ച"]),
        (365.0, ["year", "saal", "varsha", "ವರ್ಷ", "साल", "ஆண்டு", "வருடம்", "సంవత్సర", "വർഷ"]),
        (1.0, ["day", "din", "dina", "ದಿನ", "दिन", "நாள்", "రోజు", "ദിവസ"]),
    )
    for m in re.finditer(r"(\d{1,3})\s*([^\d\s,.;]{2,12})", text):
        n = int(m.group(1))
        unit = m.group(2)
        for factor, names in unit_days:
            if any(unit.startswith(x) for x in names):
                days = n * factor
                best = max(best, int(min(100, 100 * math.log1p(days) / math.log1p(90))))
                break
    loose = [
        (["since yesterday", "from yesterday", "yesterday"], 12), (["since morning", "today"], 5),
        (["last week", "a week", "one week"], 46), (["weeks", "many days", "several days", "for days"], 55),
        (["a month", "one month", "last month", "months", "long time", "very long", "many months", "ages"], 80),
        (["years", "a year", "since last year"], 100),
    ]
    for terms, score in loose:
        if _any(text, terms):
            best = max(best, score)
    return best


@dataclass
class RulesResult:
    category: str = "other"
    subcategory: Optional[str] = "other"
    certainty: float = 0.2
    factors: Dict[str, float] = field(default_factory=dict)
    danger: bool = False
    life_danger: bool = False
    danger_terms: List[str] = field(default_factory=list)
    drivers: List[str] = field(default_factory=list)   # English phrases explaining raised factors
    language: str = "en"
    matched: List[str] = field(default_factory=list)
    matched_any: bool = False


def estimate_factors(text: str, category: str, subcategory: Optional[str]) -> Tuple[Dict[str, float], List[str]]:
    t = normalise(text)
    base = BASE_FACTORS.get((category, subcategory or ""), DEFAULT_FACTORS)
    f = {name: float(v) for name, v in zip(FACTOR_NAMES, base)}
    drivers: List[str] = []
    for terms, bumps, phrase in MODIFIERS:
        if _any(t, terms):
            for k, inc in bumps.items():
                f[k] = min(100.0, f[k] + inc)
            drivers.append(phrase)
    dur = _duration_score(t)
    if dur > f["duration"]:
        f["duration"] = float(dur)
        if dur >= 40:
            drivers.append("unresolved for some time")
    danger, life, _ = detect_danger(t)
    if danger:
        f["safety_risk"] = max(f["safety_risk"], 80.0)
        f["public_impact"] = max(f["public_impact"], 50.0)
        drivers.append("possible immediate danger")
    if life:
        f["safety_risk"] = max(f["safety_risk"], 92.0)
        f["public_impact"] = max(f["public_impact"], 60.0)
    # keep order, drop duplicates
    seen = set()
    drivers = [d for d in drivers if not (d in seen or seen.add(d))]
    return f, drivers


def classify(text: str, language: Optional[str] = None) -> RulesResult:
    t = normalise(text)
    lang = detect_language(text or "", language)
    sub_scores: Dict[Tuple[str, str], int] = {}
    matched: List[str] = []
    for key, (strong, weak) in KEYWORDS.items():
        score = 0
        for term in strong:
            if _has(t, term):
                score += 3
                matched.append(term)
        for term in weak:
            if _has(t, term):
                score += 1
                matched.append(term)
        if score:
            sub_scores[key] = score
    cat_scores: Dict[str, int] = {}
    for (cat, _sub), s in sub_scores.items():
        cat_scores[cat] = max(cat_scores.get(cat, 0), s)
    for cat, terms in CATEGORY_GENERIC.items():
        g = sum(1 for term in set(terms) if _has(t, term))
        if g:
            cat_scores[cat] = cat_scores.get(cat, 0) + min(g, 2)

    if not cat_scores:
        category, sub, certainty, any_match = "other", "other", 0.2, False
    else:
        ranked = sorted(cat_scores.items(), key=lambda kv: (-kv[1], list(CATEGORY_GENERIC_ORDER).index(kv[0])
                                                          if kv[0] in CATEGORY_GENERIC_ORDER else 99))
        category, top = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0
        subs = [(k[1], s) for k, s in sub_scores.items() if k[0] == category]
        sub = None
        if subs:
            order = [k[1] for k in KEYWORDS if k[0] == category]
            sub = sorted(subs, key=lambda x: (-x[1], order.index(x[0])))[0][0]
        certainty = max(0.2, min(0.95, 0.3 + 0.12 * top - 0.03 * second))
        if sub is None:
            certainty = min(certainty, 0.45)  # category-only guess
        any_match = True

    danger, life, dterms = detect_danger(t)
    # A danger signal with no category match is still most likely an electrical / tree / drain problem.
    if danger and category == "other":
        if _any(t, ELECTRIC_WORDS):
            category, sub, certainty, any_match = "electricity", "exposed_wiring", 0.5, True
        elif _any(t, MANHOLE_WORDS):
            category, sub, certainty, any_match = "drainage", "open_manhole", 0.5, True
    factors, drivers = estimate_factors(t, category, sub)
    return RulesResult(category=category, subcategory=sub, certainty=round(certainty, 2), factors=factors,
                       danger=danger, life_danger=life, danger_terms=dterms, drivers=drivers, language=lang,
                       matched=matched, matched_any=any_match)


CATEGORY_GENERIC_ORDER = ["electricity", "water", "drainage", "roads", "trees", "waste", "public_infrastructure"]
