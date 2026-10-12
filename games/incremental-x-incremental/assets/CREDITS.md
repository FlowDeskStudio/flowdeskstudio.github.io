# 素材の出どころとライセンス

ゲームに同梱しているもの。入れ替えたり足したりしたら、この表を直す。

| 場所 | 中身 | 作者・出どころ | ライセンス | 同梱しているライセンス文 |
|---|---|---|---|---|
| `fonts/shippori/ShipporiMincho-SemiBold.ttf` | 見出しの書体「しっぽり明朝」 | The Shippori Mincho Project Authors（FONTDASU）。Google Fonts のリポジトリから取得 | SIL Open Font License 1.1 | `fonts/shippori/OFL.txt` |
| `fonts/ZenMaruGothic-*.ttf` | 控えの書体「Zen Maru Gothic」 | The Zen Projects Authors | SIL Open Font License 1.1 | `fonts/OFL.txt` |
| `img/fx/*.png` | 光・煙・火花の粒（128px に縮めたもの） | Kenney「Particle Pack 1.1」（kenney.nl） | CC0 1.0 | `img/fx/License.txt` |
| `se/*.ogg` | 効果音（60 ファイル、24 種類） | Kenney「Impact Sounds」「Interface Sounds」「RPG Audio」「Casino Audio」（kenney.nl）。用途に合わせてファイル名を付け替えた | CC0 1.0 | `se/License.txt` |
| `img/factory/*.png` | 工場の機械・ベルト・品物・壁（24 枚）。脚・梁・台は同じレンダラーの直方体で足した | Kenney「Factory Kit 3.0」（kenney.nl）の 3D モデルを `tools/render_factory.py` で描き出したもの | CC0 1.0 | `img/factory/License.txt` |
| `img/mining/*.png` | 採掘の絵 | Kenney「Survival Kit」「Nature Kit」＋ `tools/kitrender.py` の立体（`tools/art_mining.py`） | CC0 1.0 | `img/mining/License_*.txt` |
| `img/clicker/*.png` | クリッカーの絵 | Kenney「Nature Kit」「Survival Kit」「Fantasy Town Kit 2.0」「Factory Kit」「Pirate Kit」「City Kit Commercial 2.1」＋立体（`tools/art_clicker.py`） | CC0 1.0 | `img/clicker/License_*.txt` |
| `img/farm/*.png` | 農業の絵 | Kenney「Nature Kit」「Survival Kit」＋立体（`tools/art_farm.py`） | CC0 1.0 | `img/farm/License_*.txt` |
| `img/depot/*.png` | 配送センターの絵 | Kenney「Car Kit」「City Kit Industrial 2.0」「City Kit Commercial 2.1」「Nature Kit」「Pirate Kit」＋立体（`tools/art_depot.py`） | CC0 1.0 | `img/depot/License_*.txt` |
| `img/smeltery/*.png` | 精錬所の絵 | 3DAssets.dev のモデル（下の表）、Kenney「Survival Kit」（金床）「Factory Kit」（管）＋立体（`tools/art_smeltery.py`） | CC0 1.0 | `img/smeltery/License_*.txt` |
| `img/brewery/*.png` | 醸造所の絵 | 3DAssets.dev のモデル（下の表）、Kenney「Food Kit」（びん）＋立体（`tools/art_brewery.py`） | CC0 1.0 | 下の表 |
| `img/market/*.png` | 市場の絵 | 3DAssets.dev のモデル（下の表）、Kenney「Survival Kit」（木箱）＋立体（`tools/art_market.py`） | CC0 1.0 | 下の表 |
| `img/tower/*.png` | 塔の絵 | Kenney「Castle Kit」（塔、旗、岩）、3DAssets.dev のモデル（下の表）（`tools/art_tower.py`） | CC0 1.0 | 下の表 |
| `img/breed/*.png` | 品種改良の絵 | Kenney「Nature Kit」（鉢）「Survival Kit」（木箱）＋立体（`tools/art_breed.py`） | CC0 1.0 | `img/breed/License_*.txt` |
| `img/maze/*.png` | 迷路探索の絵 | Kenney「Mini Dungeon」（`tools/art_maze.py`） | CC0 1.0 | `img/maze/License_mini-dungeon.txt` |
| `img/blast/*.png` | 発破場の絵 | Kenney「Nature Kit」「Survival Kit」＋立体（`tools/art_blast.py`） | CC0 1.0 | `img/blast/License_*.txt` |
| `img/breakout/`、`img/drop/`、`img/juggle/` | ブロック崩し、ボール落とし、ジャグリングの絵 | このプロジェクトで作った立体だけ（`tools/art_*.py`）。外の素材は使っていない | ― | ― |
| `img/royal/*.svg` | ポポーの印 | このプロジェクトで描いたもの | ― | ― |
| `bgm/deepfield.mp3` | BGM（仮） | ユーザーが用意。**出どころとライセンスはユーザーが利用可と確認（2026-10-12）** | ユーザーが利用可と確認（2026-10-12） | なし |

## 守ること

- **SIL OFL の書体**：ゲームへの同梱と商用利用はできる。書体ファイルだけを単体で売ることはできない。配るときはライセンス文（OFL.txt）を一緒に入れる。書体ファイルは手を加えずに使っている（加工して配る場合は、名前の扱いに決まりがある）。
- **CC0 の素材**：表記は義務ではない。クレジット画面を作るときは「Kenney (www.kenney.nl)」を載せる。
- **BGM**：発売前に、出どころと利用条件を確かめる。

## 3DAssets.dev の 3D モデル（2026-10-12 に取得）

<https://3dassets.dev> の CC0 1.0 のモデルを、`tools/kitrender.py` で 2D の絵に描き出して使っている（モデルそのものは同梱しない）。
取得のたびに API の `license.slug` が `cc0-1.0` であることを確かめた。CC0 なので表示の義務はない。もとの記録は `asset/3dassets/index.json`。
**どれも配布元で「AI で作った」と申告されている**。Steam に出すときの「AI 生成コンテンツ」の申告に含めること。

| 使った先 | モデル | 配布ページ | ライセンス | AI 生成（申告されたモデル） |
|---|---|---|---|---|
| `img/smeltery/` | Brick boiler flue chimney, 5.6 m (Botanical Glasshouse and Palm House) | [botanical-glasshouse-and-palm-house-botanical-glasshou-adf83cc1](https://3dassets.dev/assets/botanical-glasshouse-and-palm-house-botanical-glasshou-adf83cc1) | CC0 1.0 Universal | Claude Opus 5 |
| `img/smeltery/` | Ribbed forge bellows (Dwarven Runeforge Dungeon) | [dwarven-runeforge-dungeon-dwarven-runeforge-dungeon-be-7e8e2c12](https://3dassets.dev/assets/dwarven-runeforge-dungeon-dwarven-runeforge-dungeon-be-7e8e2c12) | CC0 1.0 Universal | Claude Fable 5.1 |
| `img/smeltery/` | Pouring crucible (Dwarven Runeforge Dungeon) | [dwarven-runeforge-dungeon-dwarven-runeforge-dungeon-po-7482f109](https://3dassets.dev/assets/dwarven-runeforge-dungeon-dwarven-runeforge-dungeon-po-7482f109) | CC0 1.0 Universal | Claude Fable 5.1 |
| `img/smeltery/` | Gold bar (Pickups and Collectibles) | [pickups-and-collectibles-gold-bar-e23e11d8](https://3dassets.dev/assets/pickups-and-collectibles-gold-bar-e23e11d8) | CC0 1.0 Universal | Claude Fable 5.1 |
| `img/brewery/` | Cask, Hogshead (Distillery and Bonded Warehouse) | [distillery-and-bonded-warehouse-cask-hogshead-c243d6b2](https://3dassets.dev/assets/distillery-and-bonded-warehouse-cask-hogshead-c243d6b2) | CC0 1.0 Universal | Claude Opus 5 |
| `img/brewery/` | Brewery Mash Vat (Fantasy MMO City And Townsfolk) | [fantasy-mmo-city-and-townsfolk-brewing-vat-0529004f](https://3dassets.dev/assets/fantasy-mmo-city-and-townsfolk-brewing-vat-0529004f) | CC0 1.0 Universal | claude-opus-5 |
| `img/brewery/` | Lantern Watch Hanging Wall Lantern | [lantern-watch-hanging-wall-lantern](https://3dassets.dev/assets/lantern-watch-hanging-wall-lantern) | CC0 1.0 Universal | GPT-6 via Codex |
| `img/market/` | Market Stall (Medieval MMO Starter Realm) | [medieval-mmo-starter-realm-market-stall-e0677cc9](https://3dassets.dev/assets/medieval-mmo-starter-realm-market-stall-e0677cc9) | CC0 1.0 Universal | Claude Fable 5.1 |
| `img/market/` | Ceremonial Bell (Royal Court and Throne Palace) | [royal-court-and-throne-palace-ceremonial-bell-ca245a53](https://3dassets.dev/assets/royal-court-and-throne-palace-ceremonial-bell-ca245a53) | CC0 1.0 Universal | GPT-6 |
| `img/market/` | Coin stack icon (3D Game UI Icons) | [game-ui-icon-library-coin-stack-1418ba7f](https://3dassets.dev/assets/game-ui-icon-library-coin-stack-1418ba7f) | CC0 1.0 Universal | Claude Fable 5.1 |
| `img/tower/` | Climber ascending a fixed rope (Mountaineering and Summit Expedition) | [mountaineering-and-summit-expedition-climber-ascending-f44953c3](https://3dassets.dev/assets/mountaineering-and-summit-expedition-climber-ascending-f44953c3) | CC0 1.0 Universal | Claude Fable 5.1 |
| `img/tower/` | Loot Sack (Medieval MMO Starter Realm) | [medieval-mmo-starter-realm-loot-sack-c9b0f199](https://3dassets.dev/assets/medieval-mmo-starter-realm-loot-sack-c9b0f199) | CC0 1.0 Universal | Claude Fable 5.1 |
