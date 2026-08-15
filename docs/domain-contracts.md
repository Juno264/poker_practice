# domain-contracts.md — ドメイン層の確定仕様

`src/domain/` の**シグネチャと境界条件**。実装前にここで確定させ、実装はこの通りに書く。
仕様の解釈が分かれた箇所は「決定」として理由を残す。ここと `CLAUDE.md` が矛盾したら `CLAUDE.md` が正。

すべて純粋関数。`Date.now()` / `Math.random()` / `localStorage` / React を import しない。

---

## 1. `types.ts`

```ts
export type Rank = 'A'|'K'|'Q'|'J'|'T'|'9'|'8'|'7'|'6'|'5'|'4'|'3'|'2';
export const RANKS: readonly Rank[];   // 上の順（降順）で固定

export type Hand = `${Rank}${Rank}` | `${Rank}${Rank}s` | `${Rank}${Rank}o`;

export type Action = 'fold' | 'call' | 'raise' | '3bet' | 'push' | 'limp';
export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type Spot = 'RFI' | 'vs_RFI' | 'vs_3bet' | 'push_fold';

export type ActionFreqs = Partial<Record<Action, number>>;

/** JSON をそのまま写した形（snake_case）。検証前の生データ。 */
export type RawRangeChart = {
  schema_version: number;
  id: string;
  format: string;
  stack_bb: number;
  spot: string;
  hero_position: string;
  villain_position: string | null;
  actions: string[];
  source: { name: string; url?: string; retrieved_at?: string; entered_by?: string; notes?: string };
  ranges: Record<string, Record<string, number>>;
};

/** 検証・正規化後。ranges は 169 ハンドすべてのキーを持つ。 */
export type RangeChart = {
  schemaVersion: 1;
  id: string;
  format: string;
  stackBb: number;
  spot: Spot;
  heroPosition: Position;
  villainPosition: Position | null;
  actions: readonly Action[];
  source: { name: string; url?: string; retrievedAt?: string; enteredBy?: string; notes?: string };
  ranges: Record<Hand, ActionFreqs>;
};

export type Question = { chartId: string; hand: Hand };

export type Attempt = {
  ts: number; chartId: string; hand: Hand; chosen: Action;
  correct: boolean; isGray: boolean; freqGap: number; responseMs: number;
};
```

**決定：`Hand` はテンプレートリテラル型にする。** `string` だと JSON のキー打ち間違いを型で拾えない。
`AAs` のような論理的に不正な組み合わせは型では弾けないので、実行時は `normalizeHand` / バリデータが担当する。

**決定：JSON は snake_case のまま、TS 側は camelCase。** JSON は人間が手で書くので `CLAUDE.md` §6.1 の
表記を変えない。変換は `loadCharts.ts` の 1 箇所に閉じ込める。

---

## 2. `hands.ts`

```ts
export const ALL_HANDS: readonly Hand[];               // 169 個
export function normalizeHand(input: string): Hand;    // 不正なら throw
export function handToGridPos(h: Hand): { row: number; col: number };
export function gridPosToHand(row: number, col: number): Hand;
export function comboCount(h: Hand): number;
export function isPair(h: Hand): boolean;
export function isSuited(h: Hand): boolean;
```

### `ALL_HANDS` の順序（確定）

13×13 グリッドの行優先。`index = row * 13 + col`、`row` / `col` はどちらも `RANKS` 順（0 = A）。

- `row === col` → ペア（`AA`, `KK`, …）
- `row < col` → スーテッド（`RANKS[row] + RANKS[col] + 's'`）※右上
- `row > col` → オフスート（`RANKS[col] + RANKS[row] + 'o'`）※左下

これは `CLAUDE.md` §9 のリークグリッドの標準レイアウトと同一。`handToGridPos` はこの逆写像で、
`gridPosToHand(row, col)` と往復一致すること。

### `normalizeHand` の受理／拒否（確定）

受理して正規化する：
- 大文字小文字の混在（`aks` → `AKs`、`AKS` → `AKs`）
- `10` を `T` として扱う（`10 9s` は不可。空白は前後の trim のみ）
- 前後の空白

**throw する**：
- ランク順が逆（`KAs`）— 自動で並べ替え**ない**
- ペアにサフィックスが付く（`AAs`, `AAo`）
- 非ペアにサフィックスが無い（`AK`）
- 未知の文字・長さ違い（`XX`, `AKss`, 空文字）

**決定：`KAs` を並べ替えずに throw する。** この関数はレンジ JSON の読み込み境界で使う。
表記ゆれを黙って直すと、入力ミスのあるチャートがそのまま数千回反復されてしまう。
`CLAUDE.md` §2.1 の「誤ったものを高速で自動化しない」を、ここで機械的に担保する。

### `comboCount`

ペア 6 / スーテッド 4 / オフスート 12。v0.1 では使わないが実装とテストは書く。

### テスト（`hands.test.ts`）

- `ALL_HANDS.length === 169`、重複なし、ペア 13 / スーテッド 78 / オフスート 78
- 全ハンドで `gridPosToHand(handToGridPos(h)) === h`
- `handToGridPos` の座標が 169 個すべて相異なる
- `normalizeHand('KAs')` が throw、`normalizeHand('aks') === 'AKs'`、`normalizeHand('10Ts')` が throw
- `comboCount` 3 パターン

---

## 3. `scoring.ts`

```ts
export const GRAY_THRESHOLD = 0.15;
export const EPS = 1e-9;

export type ScoreResult = {
  chosen: Action;
  chosenFreq: number;
  maxFreq: number;
  secondFreq: number;
  freqGap: number;              // 0.0–1.0
  isGray: boolean;
  correct: boolean;
  bestActions: Action[];        // argmax。同率なら複数
  breakdown: { action: Action; freq: number }[];  // freq 降順。UI のバー表示用
};

export function scoreAnswer(
  freqs: ActionFreqs,
  actions: readonly Action[],
  chosen: Action,
): ScoreResult;
```

### 規則（確定）

1. 集計対象は `actions` に列挙されたアクションのみ。`freqs` に無いものは `0` として扱う。
2. `chosen` が `actions` に含まれない → throw（UI のバグ。黙って 0 点にしない）。
3. `maxFreq` / `secondFreq` は `actions` の頻度を降順に並べた 1 番目 / 2 番目。
   `actions.length === 1` なら `secondFreq = 0`。
4. `freqGap = Math.max(0, maxFreq - chosenFreq)`（浮動小数の -1e-17 を出さない）。
5. `correct = (maxFreq - chosenFreq) <= EPS`。
6. `isGray = (maxFreq - secondFreq) < GRAY_THRESHOLD - EPS`。

**決定：同率トップは全部正解にする（規則 5）。** `raise 0.5 / fold 0.5` で片方だけを正解にするのは
コイントスの採点で、`CLAUDE.md` §7 の「混合戦略を強く罰しない」に反する。
同率のときは必ず `maxFreq - secondFreq === 0` なので `isGray` も真になり、主指標からは除外される。

**決定：グレー判定に `EPS` を入れる（規則 6）。** `0.60 - 0.45` は 2 進浮動小数で
`0.15000000000000002` になる。素朴に `< 0.15` と書くと「差がちょうど 0.15」の境界が
入力値の書き方で揺れる。`CLAUDE.md` §7 は `< 0.15` なので**ちょうど 0.15 はグレーではない**が、
比較は `< 0.15 - EPS` として揺れを潰す。

### テスト（`scoring.test.ts`）

- 純粋レンジ（`raise 1.0 / fold 0.0`）：正解 → `correct` 真 / `freqGap 0` / `isGray` 偽
- 同上で誤答 → `freqGap 1.0`、`isGray` 偽
- 混合（`0.55 / 0.45`）：`isGray` 真、どちらを選んでも `freqGap <= 0.1`
- 境界：差がちょうど `0.15`（例 `0.575 / 0.425`、および `0.60 / 0.45`）→ `isGray` 偽
- 境界：差が `0.1499` → `isGray` 真
- 同率（`0.5 / 0.5`）：両方 `correct` 真、`bestActions.length === 2`
- 3 アクション（`3bet 0.2 / call 0.5 / fold 0.3`）：`secondFreq === 0.3`、`breakdown` が降順
- `chosen` が `actions` に無い → throw

---

## 4. `sampler.ts`

```ts
export const W_INIT = 1.0, W_MAX = 12.0, W_MIN = 0.25;
export const W_WRONG = 3.0, W_RIGHT = 0.6;
export const SLOW_MS = 5000;
export const COOLDOWN = 8;

export type WeightKey = string;                        // `${chartId}|${hand}`
export function weightKey(chartId: string, hand: Hand): WeightKey;

export function nextWeight(
  current: number,
  outcome: { correct: boolean; responseMs: number },
): number;

export function pickQuestion(
  pool: readonly Question[],
  weights: Readonly<Record<WeightKey, number>>,
  recent: readonly WeightKey[],
  rng: () => number,                                   // [0, 1)
): Question;

export function pushRecent(recent: readonly WeightKey[], key: WeightKey): WeightKey[];
```

### `nextWeight`（確定）

```
不正解                          → min(current * 3.0, 12.0)
正解 かつ responseMs >  5000    → current（変えない）
正解 かつ responseMs <= 5000    → max(current * 0.6, 0.25)
```

`CLAUDE.md` §8 の「遅い正解は減衰させない」。境界の 5000ms ちょうどは**速い正解**として扱う。

### `pickQuestion`（確定）

1. 重み未登録のキーは `W_INIT` とみなす。
2. クールダウン：`recent` の末尾 `min(COOLDOWN, pool.length - 1)` 件を候補から除外。
   **`pool` が小さいときに候補が全滅しないための上限。** チャート 1 つ（169 ハンド）なら実質 8 件。
3. 候補の重み合計 `total` に対し `r = rng() * total`、累積和が初めて `r` を超えた候補を返す。
4. `total <= 0`（すべての重みが 0 や NaN の異常時）→ 候補から一様抽選。ここで throw しない。
5. `pool` が空 → throw。
6. 同じ引数なら必ず同じ結果（`rng` を含めて決定的）。

### `pushRecent`

末尾に追加し、長さ `COOLDOWN` を超えたら先頭から捨てる。新しい配列を返す（破壊しない）。

### テスト（`sampler.test.ts`）

- `nextWeight`：不正解の上限 12 到達、正解の下限 0.25 到達、5000ms ちょうど、5001ms
- `pickQuestion`：シード固定 LCG（テスト内に実装）で 10,000 回引き、重み 3:1 の 2 択が
  概ね 3:1（±5%）になる
- 直近 8 問に出たハンドが返らない
- `pool.length === 1` のとき、`recent` に入っていても必ずそのハンドが返る（規則 2 の上限）
- 全重み 0 でも throw しない

---

## 5. `validateChart.ts`

```ts
export type IssueLevel = 'error' | 'warn';
export type ValidationIssue = { level: IssueLevel; code: string; message: string; hand?: string };
export function validateChart(raw: unknown, label: string): ValidationIssue[];
```

`label` はファイル名などの表示用。戻り値が空配列なら問題なし。

### error（ビルドを落とす）

| code | 条件 |
|---|---|
| `bad-schema` | 必須フィールド欠落 / 型不一致 / `schema_version !== 1` |
| `unknown-enum` | `spot` / `hero_position` / `villain_position` / `actions` が既知の値でない |
| `bad-hand-key` | `ranges` のキーが正規表記でない（`normalizeHand` が throw する、または結果がキーと不一致） |
| `duplicate-hand` | 正規化後に同じハンドが 2 度現れる |
| `freq-sum` | ハンドの頻度合計が `1.0 ± 0.01` の外 |
| `bad-freq` | 頻度が数値でない / 負 / 1 より大きい |
| `unknown-action` | `ranges` の中に `actions` に無いアクションが現れる |
| `missing-source-name` | `source.name` が空文字または欠落 |
| `missing-fold-action` | ハンド欠損があるのに `actions` に `fold` が無い（`fold: 1.0` で補完できない） |

### warn（ビルドは通す）

| code | 条件 |
|---|---|
| `missing-hands` | 169 ハンドが揃っていない。**件数と、先頭 10 件のハンド名**をメッセージに含める |

**決定：`missing-fold-action` を error にした。** `CLAUDE.md` §6.2 は欠損を `fold: 1.0` として扱うと
定めているが、`push_fold` 以外で `actions` に `fold` が無いチャートを将来足したとき、補完が
成立しないまま warn だけ出て静かに壊れる。補完できないなら止める。

### テスト（`validateChart.test.ts`）

各 code につき、それを 1 つだけ踏むフィクスチャで再現。正常なチャートで `[]` が返ること。
`0.999` と `1.001` は通り、`0.98` は落ちること。

---

## 6. `stats.ts`（v0.2。v0.1 では**実装しない**）

シグネチャだけ先に決めておく。`Attempt[]` 以外に依存しない。

```ts
export type Period = { fromTs: number; toTs: number };
export type Summary = {
  asked: number;
  accuracyNonGray: number | null;   // 母数 0 なら null。0 を返さない
  accuracyGray: number | null;
  meanFreqGap: number | null;
  medianResponseMs: number | null;
};
export function summarize(attempts: readonly Attempt[], period?: Period): Summary;
export function summarizeByChart(attempts: readonly Attempt[], period?: Period): Record<string, Summary>;
export function errorRateByHand(attempts: readonly Attempt[], period?: Period): Record<Hand, { asked: number; wrong: number; rate: number }>;
export function responseMsHistogram(attempts: readonly Attempt[], binMs: number): { from: number; to: number; count: number }[];
```

母数 0 で `0` を返すと、リークグリッドで「未出題」と「全問正解」が同じ色になる。`null` で分ける。

---

## 7. `src/storage/local.ts`

純粋ではない唯一の非 UI モジュール。ドメイン層から import しない。

```ts
export const KEY_ATTEMPTS = 'preflop-trainer:v1:attempts';
export const KEY_WEIGHTS  = 'preflop-trainer:v1:weights';
export const STORAGE_VERSION = 1;

export function loadAttempts(): Attempt[];
export function saveAttempts(attempts: readonly Attempt[]): void;
export function loadWeights(): Record<WeightKey, number>;
export function saveWeights(weights: Readonly<Record<WeightKey, number>>): void;
export function resetWeights(): void;
export function resetAll(): void;
```

- 保存形式は `{ v: STORAGE_VERSION, data: ... }` のエンベロープ。
- JSON パース失敗 / `v` 不一致 / 形が違う → **そのキーを消して空を返す**（`CLAUDE.md` v0.1 §4）。
- `QuotaExceededError` → `attempts` を古い順に半分捨てて 1 度だけ再試行。それでも失敗したら諦める。
  **例外を UI に投げない。** 保存できないことより、ドリルが止まる方が損害が大きい。
- `localStorage` 自体が使えない環境（アクセスで throw する）でも import 時に落ちないこと。
