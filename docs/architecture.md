# architecture.md — 構造設計

仕様の一次情報は `CLAUDE.md`。ここは**それをコードに落とすときの構造**だけを書く。
関数シグネチャと境界条件は `docs/domain-contracts.md`。

---

## 1. レイヤ

```
data/ranges/*.json      人間が出典付きで入力する静的データ（Claude は数値に触れない）
        │  ビルド時に import.meta.glob で取り込み
        ▼
src/data/loadCharts.ts  検証 → 正規化（snake_case → camelCase、欠損ハンドの補完）
        │
        ▼
src/domain/*            純粋関数のみ。React・DOM・localStorage・Date・Math.random に依存しない
        │
        ▼
src/state/drill.ts      useReducer。純粋。副作用の値（now / 抽選結果）は action の payload で渡す
        │
        ▼
src/screens, components React。ここだけが副作用を持つ
        │
        ▼
src/storage/local.ts    localStorage。失敗しても drill は止めない
```

依存の向きは常に上から下。`src/domain/` から上位を import しない。これは規約ではなく**制約**で、
ポストフロップドリル／ハンド台帳（v0.5 以降）が再利用するのはこの層だけだから。

---

## 2. データ読み込みパイプライン

`src/data/loadCharts.ts`

1. `import.meta.glob('../../data/ranges/*.json', { eager: true })` で全チャートを取得
2. 各チャートを `validateChart()`（`src/domain/validateChart.ts`、純粋）にかける
3. `error` が 1 件でもあれば **throw**（ビルド時 CI で `npm run validate` が同じ関数で先に落とす）
4. `warn`（ハンド欠損）は `console.warn` に件数を出し、欠損ハンドを `{ fold: 1.0 }` で補完
5. snake_case の JSON を camelCase の `RangeChart` に変換して返す

**補完後は 169 ハンドすべてのキーが存在する。** 以降のドメイン層は `undefined` を考慮しない。
`actions` に `fold` を含まないチャートでハンドが欠損していた場合は補完できないので、
これは warn ではなく error（`missing-fold-action`）。

チャート ID の重複も error。ID はファイル名（拡張子なし）と一致させる。

---

## 3. 出題の状態機械

```
        ┌──────────────┐  ANSWER(action, responseMs, now)   ┌──────────────┐
        │  question    │ ─────────────────────────────────▶ │  feedback    │
        │ (計測中)     │                                    │ (頻度内訳表示)│
        └──────────────┘ ◀───────────────────────────────── └──────────────┘
                            NEXT(question)  ※抽選済みの問題を渡す
```

`src/state/drill.ts` の reducer は純粋に保つ。したがって：

- **抽選は reducer の外**で行う。`pickQuestion(pool, weights, recent, Math.random)` の結果を
  `NEXT` action の payload に載せる。
- `ts`（epoch ms）も呼び出し側で `Date.now()` を取って payload に載せる。
- 反応時間は `performance.now()` の差分で測る（`Date.now()` は端末のクロック補正で飛ぶ）。
  計測開始は問題を state に入れた瞬間ではなく、**ボタンが操作可能になった直後**（`useLayoutEffect`）。

### state の形

```ts
type DrillState = {
  phase: 'question' | 'feedback';
  pool: Question[];            // 選択中チャート × 169 ハンド
  current: Question;
  score: ScoreResult | null;   // feedback 中のみ非 null
  recent: WeightKey[];         // クールダウン用。末尾が最新、長さ上限 8
  weights: Record<WeightKey, number>;
  session: { asked: number; correctNonGray: number; askedNonGray: number; responseMs: number[] };
  pendingAttempts: Attempt[];  // 未フラッシュ分
};
```

`session.responseMs` は中央値を出すために全件持つ。1 セッション数百件なので配列で十分。

---

## 4. 永続化のタイミング

`attempts` は 1 問ごとに全件 `JSON.stringify` すると、件数が増えたとき端末で目に見えて遅くなる
（1 万件で 1 MB 弱の直列化が毎問走る）。反応時間を計測するアプリでこれは許容できない。

- `weights`：1 問ごとに保存（最大 845 エントリ、軽い）
- `attempts`：メモリに貯めて **10 問ごと**、および `pagehide` / `visibilitychange:hidden` でフラッシュ
- 5 万件を超えたら古い順に圧縮集計へ落とす（`CLAUDE.md` §6.4）。v0.2 の `stats.ts` と同時に実装

`localStorage` が使えない環境（プライベートモード等）でも**ドリルは動く**。保存に失敗したら
警告を 1 度だけ出して続行する。学習の継続がデータ保全より優先。

---

## 5. オフライン

`CLAUDE.md` §3 は「オフラインで完全動作すること」を要求している。GitHub Pages に静的配信するだけでは
2 回目以降もネットワークを見に行くので、**電車内（圏外・地下）で開けない**。
これは主要ユースケースそのものが動かないという意味なので、v0.1 のデプロイ作業に
`vite-plugin-pwa`（`registerType: 'autoUpdate'`、precache は全アセット）を含める。
サーバーを持たないアプリなので設定は 10 行程度で済む。

---

## 6. ディレクトリ（`CLAUDE.md` §4 からの差分）

追加するもの。仕様の構成は変えていない。

```
src/
├── data/loadCharts.ts     チャート読み込みと正規化
├── domain/
│   ├── types.ts           Hand / Action / RangeChart などの型
│   ├── validateChart.ts   純粋なバリデーション（scripts と CI が共用）
│   └── (hands|scoring|sampler|stats).ts
├── state/drill.ts         useReducer（純粋）
tests/fixtures/            テスト用の合成チャート ※実レンジではない。data/ranges には置かない
docs/                      architecture / domain-contracts / workflow
```

> テスト用フィクスチャの頻度は**学習には一切使わない合成値**。`data/ranges/` に入れてはならない。
> ファイル冒頭の `source.name` に `SYNTHETIC — test fixture, not a real range` と明記する。

---

## 7. UI 構成（v0.1）

```
App
├── ChartPicker      チャート選択（5 つ + 「全部混ぜる」）。ドリル開始前のみ
└── Drill
    ├── HandDisplay      大きく 1 行。アニメーションなし
    ├── ActionButtons    画面下部固定。actions.length に応じて可変（v0.3 で 3 択になる）
    ├── Feedback         全アクションの頻度バー + グレーゾーン表示
    └── SessionCounter   正答数 / 出題数 / 中央反応時間
```

- `ActionButtons` は最初から `actions: readonly Action[]` を受け取る可変実装にする。
  v0.3 でアクションが 3 択になったときに書き直さないため。
- 最小タップ領域 48px、`safe-area-inset-bottom` を考慮。375px 幅で成立させる。
- ダーク固定。テーマ切り替えは作らない。
