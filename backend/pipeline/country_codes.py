"""ISO-2 country codes <-> the English names GDELT's DOC 2.0 API expects.

ISO-2 is the canonical country code everywhere else in this codebase
(Outlet.country, User.countries, Article/Story .*_countries). GDELT's DOC API
is the only place that deals in country *names* instead - confirmed live: it
accepts a query term of the country's common English name with spaces/
punctuation stripped and lowercased (e.g. `sourcecountry:unitedkingdom`), and
each result is tagged with that same name, properly capitalized (e.g.
"sourcecountry": "United Kingdom"). No FIPS code is involved on either side,
so this module only needs a name <-> ISO-2 table, not the more obscure (and
error-prone to hand-transcribe) FIPS 10-4 list GDELT's older docs mention as
an alternative query syntax.

Mapping is intentionally forgiving: an unrecognized name from GDELT is
skipped (see gdelt_name_to_iso2) rather than guessed at, so a naming variant
we haven't added an alias for just means that one result doesn't get
country-tagged - never that it gets mis-tagged.
"""

# ISO-2 -> canonical English name (also used, lowercased/stripped, as the
# GDELT DOC API query term for that country).
COUNTRY_NAMES: dict[str, str] = {
    "AF": "Afghanistan", "AL": "Albania", "DZ": "Algeria", "AD": "Andorra",
    "AO": "Angola", "AG": "Antigua and Barbuda", "AR": "Argentina", "AM": "Armenia",
    "AU": "Australia", "AT": "Austria", "AZ": "Azerbaijan", "BS": "Bahamas",
    "BH": "Bahrain", "BD": "Bangladesh", "BB": "Barbados", "BY": "Belarus",
    "BE": "Belgium", "BZ": "Belize", "BJ": "Benin", "BT": "Bhutan",
    "BO": "Bolivia", "BA": "Bosnia and Herzegovina", "BW": "Botswana", "BR": "Brazil",
    "BN": "Brunei", "BG": "Bulgaria", "BF": "Burkina Faso", "BI": "Burundi",
    "KH": "Cambodia", "CM": "Cameroon", "CA": "Canada", "CV": "Cape Verde",
    "CF": "Central African Republic", "TD": "Chad", "CL": "Chile", "CN": "China",
    "CO": "Colombia", "KM": "Comoros", "CG": "Congo", "CD": "Democratic Republic of Congo",
    "CR": "Costa Rica", "HR": "Croatia", "CU": "Cuba", "CY": "Cyprus",
    "CZ": "Czech Republic", "DK": "Denmark", "DJ": "Djibouti", "DM": "Dominica",
    "DO": "Dominican Republic", "TL": "East Timor", "EC": "Ecuador", "EG": "Egypt",
    "SV": "El Salvador", "GQ": "Equatorial Guinea", "ER": "Eritrea", "EE": "Estonia",
    "SZ": "Eswatini", "ET": "Ethiopia", "FJ": "Fiji", "FI": "Finland",
    "FR": "France", "GA": "Gabon", "GM": "Gambia", "GE": "Georgia",
    "DE": "Germany", "GH": "Ghana", "GR": "Greece", "GD": "Grenada",
    "GT": "Guatemala", "GN": "Guinea", "GW": "Guinea-Bissau", "GY": "Guyana",
    "HT": "Haiti", "HN": "Honduras", "HK": "Hong Kong", "HU": "Hungary",
    "IS": "Iceland", "IN": "India", "ID": "Indonesia", "IR": "Iran",
    "IQ": "Iraq", "IE": "Ireland", "IL": "Israel", "IT": "Italy",
    "CI": "Ivory Coast", "JM": "Jamaica", "JP": "Japan", "JO": "Jordan",
    "KZ": "Kazakhstan", "KE": "Kenya", "KI": "Kiribati", "KP": "North Korea",
    "KR": "South Korea", "KW": "Kuwait", "KG": "Kyrgyzstan", "LA": "Laos",
    "LV": "Latvia", "LB": "Lebanon", "LS": "Lesotho", "LR": "Liberia",
    "LY": "Libya", "LI": "Liechtenstein", "LT": "Lithuania", "LU": "Luxembourg",
    "MO": "Macau", "MG": "Madagascar", "MW": "Malawi", "MY": "Malaysia",
    "MV": "Maldives", "ML": "Mali", "MT": "Malta", "MR": "Mauritania",
    "MU": "Mauritius", "MX": "Mexico", "MD": "Moldova", "MC": "Monaco",
    "MN": "Mongolia", "ME": "Montenegro", "MA": "Morocco", "MZ": "Mozambique",
    "MM": "Myanmar", "NA": "Namibia", "NP": "Nepal", "NL": "Netherlands",
    "NZ": "New Zealand", "NI": "Nicaragua", "NE": "Niger", "NG": "Nigeria",
    "MK": "North Macedonia", "NO": "Norway", "OM": "Oman", "PK": "Pakistan",
    "PS": "Palestine", "PA": "Panama", "PG": "Papua New Guinea", "PY": "Paraguay",
    "PE": "Peru", "PH": "Philippines", "PL": "Poland", "PT": "Portugal",
    "QA": "Qatar", "RO": "Romania", "RU": "Russia", "RW": "Rwanda",
    "WS": "Samoa", "SM": "San Marino", "SA": "Saudi Arabia", "SN": "Senegal",
    "RS": "Serbia", "SC": "Seychelles", "SL": "Sierra Leone", "SG": "Singapore",
    "SK": "Slovakia", "SI": "Slovenia", "SB": "Solomon Islands", "SO": "Somalia",
    "ZA": "South Africa", "SS": "South Sudan", "ES": "Spain", "LK": "Sri Lanka",
    "SD": "Sudan", "SR": "Suriname", "SE": "Sweden", "CH": "Switzerland",
    "SY": "Syria", "TW": "Taiwan", "TJ": "Tajikistan", "TZ": "Tanzania",
    "TH": "Thailand", "TG": "Togo", "TO": "Tonga", "TT": "Trinidad and Tobago",
    "TN": "Tunisia", "TR": "Turkey", "TM": "Turkmenistan", "TV": "Tuvalu",
    "UG": "Uganda", "UA": "Ukraine", "AE": "United Arab Emirates", "GB": "United Kingdom",
    "US": "United States", "UY": "Uruguay", "UZ": "Uzbekistan", "VU": "Vanuatu",
    "VA": "Vatican City", "VE": "Venezuela", "VN": "Vietnam", "YE": "Yemen",
    "ZM": "Zambia", "ZW": "Zimbabwe",
}

# Alternate English names GDELT (or a user-facing search box) might use,
# lowercased -> ISO-2. Extend as unmapped `sourcecountry` values turn up.
_ALIASES: dict[str, str] = {
    "united states of america": "US",
    "usa": "US",
    "great britain": "GB",
    "uk": "GB",
    "south korea": "KR",
    "korea, south": "KR",
    "republic of korea": "KR",
    "north korea": "KP",
    "korea, north": "KP",
    "democratic people's republic of korea": "KP",
    "democratic republic of the congo": "CD",
    "dr congo": "CD",
    "republic of the congo": "CG",
    "cote d'ivoire": "CI",
    "côte d'ivoire": "CI",
    "czechia": "CZ",
    "burma": "MM",
    "eswatini (swaziland)": "SZ",
    "swaziland": "SZ",
    "east timor": "TL",
    "timor-leste": "TL",
    "russian federation": "RU",
    "syrian arab republic": "SY",
    "viet nam": "VN",
    "the netherlands": "NL",
    "the bahamas": "BS",
    "the gambia": "GM",
    "macedonia": "MK",
    "macao": "MO",
    "west bank": "PS",
    "gaza": "PS",
    "state of palestine": "PS",
}


def _normalize(name: str) -> str:
    return "".join(ch for ch in name.strip().lower() if ch.isalnum() or ch == " ").strip()


_NAME_TO_ISO2: dict[str, str] = {
    _normalize(name): code for code, name in COUNTRY_NAMES.items()
} | {_normalize(alias): code for alias, code in _ALIASES.items()}


def iso2_to_gdelt_query(iso2: str) -> str | None:
    """The `sourcecountry:` query term GDELT's DOC API expects for this ISO-2 code."""
    name = COUNTRY_NAMES.get(iso2.upper())
    if not name:
        return None
    return "".join(ch for ch in name.lower() if ch.isalnum())


def gdelt_name_to_iso2(name: str) -> str | None:
    """Map a `sourcecountry` name from a GDELT DOC API response back to ISO-2.

    Returns None for unrecognized names rather than guessing - callers should
    skip country-tagging for that record, not mis-tag it.
    """
    return _NAME_TO_ISO2.get(_normalize(name))


# GKG's V2Locations column (parsed in pipeline/gdelt.py) encodes location
# countries as FIPS 10-4, not the names DOC API uses - a separate GDELT
# convention, so a separate table. Sourced from the NGA/FIPS-PUB-10-4 <-> ISO
# 3166-1 mapping published at
# https://github.com/mysociety/gaze/blob/master/data/fips-10-4-to-iso-country-codes.csv,
# restricted to codes that resolve to a country in COUNTRY_NAMES above
# (dependent territories etc. are dropped, not mis-mapped to a parent state).
FIPS_TO_ISO2: dict[str, str] = {
    "AC": "AG", "AE": "AE", "AF": "AF", "AG": "DZ", "AJ": "AZ", "AL": "AL",
    "AM": "AM", "AN": "AD", "AO": "AO", "AR": "AR", "AS": "AU", "AT": "AU",
    "AU": "AT", "BA": "BH", "BB": "BB", "BC": "BW", "BE": "BE", "BF": "BS",
    "BG": "BD", "BH": "BZ", "BK": "BA", "BL": "BO", "BM": "MM", "BN": "BJ",
    "BO": "BY", "BP": "SB", "BR": "BR", "BT": "BT", "BU": "BG", "BX": "BN",
    "BY": "BI", "CA": "CA", "CB": "KH", "CD": "TD", "CE": "LK", "CF": "CG",
    "CG": "CD", "CH": "CN", "CI": "CL", "CM": "CM", "CN": "KM", "CO": "CO",
    "CR": "AU", "CS": "CR", "CT": "CF", "CU": "CU", "CV": "CV", "CY": "CY",
    "DA": "DK", "DJ": "DJ", "DO": "DM", "DR": "DO", "EC": "EC", "EG": "EG",
    "EI": "IE", "EK": "GQ", "EN": "EE", "ER": "ER", "ES": "SV", "ET": "ET",
    "EZ": "CZ", "FI": "FI", "FJ": "FJ", "FR": "FR", "GA": "GM", "GB": "GA",
    "GG": "GE", "GH": "GH", "GJ": "GD", "GK": "GB", "GM": "DE", "GR": "GR",
    "GT": "GT", "GV": "GN", "GY": "GY", "GZ": "PS", "HA": "HT", "HK": "HK",
    "HO": "HN", "HR": "HR", "HU": "HU", "IC": "IS", "ID": "ID", "IM": "GB",
    "IN": "IN", "IR": "IR", "IS": "IL", "IT": "IT", "IV": "CI", "IZ": "IQ",
    "JA": "JP", "JE": "GB", "JM": "JM", "JO": "JO", "KE": "KE", "KG": "KG",
    "KN": "KP", "KR": "KI", "KS": "KR", "KU": "KW", "KZ": "KZ", "LA": "LA",
    "LE": "LB", "LG": "LV", "LH": "LT", "LI": "LR", "LO": "SK", "LS": "LI",
    "LT": "LS", "LU": "LU", "LY": "LY", "MA": "MG", "MC": "MO", "MD": "MD",
    "MG": "MN", "MI": "MW", "MJ": "ME", "MK": "MK", "ML": "ML", "MN": "MC",
    "MO": "MA", "MP": "MU", "MR": "MR", "MT": "MT", "MU": "OM", "MV": "MV",
    "MX": "MX", "MY": "MY", "MZ": "MZ", "NG": "NE", "NH": "VU", "NI": "NG",
    "NL": "NL", "NO": "NO", "NP": "NP", "NS": "SR", "NU": "NI", "NZ": "NZ",
    "OD": "SS", "PA": "PY", "PE": "PE", "PK": "PK", "PL": "PL", "PM": "PA",
    "PO": "PT", "PP": "PG", "PU": "GW", "QA": "QA", "RI": "RS", "RO": "RO",
    "RP": "PH", "RS": "RU", "RW": "RW", "SA": "SA", "SE": "SC", "SF": "ZA",
    "SG": "SN", "SI": "SI", "SL": "SL", "SM": "SM", "SN": "SG", "SO": "SO",
    "SP": "ES", "SU": "SD", "SW": "SE", "SY": "SY", "SZ": "CH", "TD": "TT",
    "TH": "TH", "TI": "TJ", "TN": "TO", "TO": "TG", "TS": "TN", "TT": "TL",
    "TU": "TR", "TV": "TV", "TW": "TW", "TX": "TM", "TZ": "TZ", "UG": "UG",
    "UK": "GB", "UP": "UA", "US": "US", "UV": "BF", "UY": "UY", "UZ": "UZ",
    "VE": "VE", "VM": "VN", "VT": "VA", "WA": "NA", "WE": "PS", "WS": "WS",
    "WZ": "SZ", "YM": "YE", "ZA": "ZM", "ZI": "ZW",
}


def fips_to_iso2(fips: str) -> str | None:
    """Map a GKG V2Locations FIPS 10-4 country code to ISO-2, or None if
    unrecognized/a dependent territory outside COUNTRY_NAMES - skip, don't guess."""
    return FIPS_TO_ISO2.get(fips.upper())
