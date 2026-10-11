"""Film-label-v1 cross-language contract checks."""
import hashlib
import json
from pathlib import Path
import unittest
from .icon import default_film_label, render_icon, validate_icon
from .test_package import package, members, STYLE_ID

ROWS = json.loads((Path(__file__).parent / 'fixtures/film-labels.json').read_text())

class FilmLabelTests(unittest.TestCase):
    def test_shared_hashes_and_cube_identity(self):
        original = members(package())['look.cube']
        for row in ROWS:
            with self.subTest(icon=row['icon']):
                self.assertEqual(hashlib.sha256(render_icon(row['icon'])).hexdigest(), row['sha256'])
                self.assertEqual(members(package(icon=row['icon']))['look.cube'], original)

    def test_defaults(self):
        self.assertEqual(default_film_label('Gold 200', STYLE_ID), dict(ROWS[0]['icon'], layout='split', top_color='#E8B640'))
        self.assertEqual(default_film_label('胶片', STYLE_ID)['top_text'], '8455')
        self.assertEqual(default_film_label('123456', STYLE_ID)['bottom_text'], '1234')
        self.assertEqual(default_film_label('Gold 20 extra', STYLE_ID)['bottom_text'], '')

    def test_strict_fields(self):
        icon = ROWS[0]['icon']
        for changes in ({'layout':'other'}, {'top_text':'A\n'}, {'top_color':'#FFFFFF\n'}, {'top_text':''}, {'top_text':'ABCDE'}, {'bottom_text':'abc'}, {'top_color':'#abcdef'}, {'bottom_color':123}, {'text':'GOLD'}, {'template':'film-label-v2'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_icon(dict(icon, **changes))
        for key in icon:
            missing = dict(icon)
            del missing[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                validate_icon(missing)

    def test_contrast_and_band_boundary(self):
        icon = ROWS[0]['icon']
        start = (5 * 32 + 7) * 4
        self.assertEqual(render_icon(dict(icon, top_color='#757575'))[start:start+4], bytes((248,244,235,255)))
        self.assertEqual(render_icon(dict(icon, top_color='#767676'))[start:start+4], bytes((24,24,24,255)))
        start = (27 * 32 + 2) * 4
        self.assertEqual(render_icon(dict(icon, layout='band'))[start:start+4], bytes((66,45,40,255)))
