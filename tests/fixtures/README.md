# tests/fixtures

ここの JSON は**合成値**。バリデータと採点ロジックの検証専用で、実戦の学習には使えない。

- `data/ranges/` にコピーしない
- 数値を「それらしく」直さない（テストが何を検証しているか壊れる）
- 各ファイルの `source.name` は `SYNTHETIC — test fixture, not a real range` で始める

`invalid_*.json` は意図的に壊してある。ファイル名の末尾がバリデータの issue code に対応する。
