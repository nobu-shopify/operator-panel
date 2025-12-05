# Operator Panel - Shopify Theme App Extension

CSオペレーター向けの顧客情報管理パネル。オペレーターが顧客を検索し、その顧客のデータを自分のアカウントに取り込んで代理注文を行うためのShopify拡張機能。

## 概要

```
┌─────────────────────────────────────────────────────────────────┐
│                         Shopify Store                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐│
│  │  Theme App Extension │    │      Checkout UI Extension      ││
│  │  (Operator Panel)    │    │     (Customer Metafields)       ││
│  │                      │    │                                 ││
│  │  • 顧客検索          │    │  • メタフィールド表示           ││
│  │  • オペレーター情報  │    │  • 配送先住所自動入力           ││
│  │  • データ取り込み    │    │                                 ││
│  └──────────┬───────────┘    └────────────────┬────────────────┘│
│             │                                 │                 │
│             │        App Proxy                │                 │
│             ▼                                 ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Remix Backend                            ││
│  │  • proxy.customers.jsx  (顧客検索API)                       ││
│  │  • proxy.import-customer.jsx (データ取り込みAPI)            ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Shopify GraphQL Admin API                   ││
│  │  • Customer Query                                           ││
│  │  • Customer Update Mutation                                 ││
│  │  • Metafields Delete Mutation                               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## ディレクトリ構成

```
operator-panel/
├── app/
│   └── routes/
│       ├── proxy.customers.jsx      # 顧客検索 App Proxy
│       └── proxy.import-customer.jsx # データ取り込み App Proxy
├── extensions/
│   ├── operator-panel-ui/           # Theme App Extension
│   │   ├── blocks/
│   │   │   └── customer_panel.liquid # メインUI
│   │   └── locales/
│   │       ├── ja.default.json      # 日本語 (デフォルト)
│   │       └── en.json              # 英語
│   └── customer-metafields/         # Checkout UI Extension
│       ├── src/
│       │   └── Checkout.jsx         # チェックアウトUI
│       ├── locales/
│       │   ├── ja.default.json
│       │   └── en.json
│       └── shopify.extension.toml
└── shopify.app.toml                 # アプリ設定
```

## データ構造

### Customer Metafields

オペレーターおよび顧客に関連付けられるカスタムメタフィールド：

| Namespace | Key | Type | 説明 |
|-----------|-----|------|------|
| `custom` | `card_id` | `single_line_text_field` | 会員カードID |
| `custom` | `customer_id` | `single_line_text_field` | 顧客ID（外部システム連携用） |
| `custom` | `points` | `number_integer` | ポイント残高 |
| `custom` | `gender` | `single_line_text_field` | 性別（"男性", "女性", "回答せず"） |
| `custom` | `birthday` | `date` | 生年月日 |
| `custom` | `is_operator` | `boolean` | CSオペレーターフラグ |
| `custom` | `operator_ordered_for_customer` | `single_line_text_field` | 代理注文対象の顧客ID |
| `custom` | `shipping_address` | `json` | チェックアウト用配送先住所 |

### shipping_address JSON構造

```json
{
  "firstName": "太郎",
  "lastName": "山田",
  "address1": "渋谷区渋谷1-1-1",
  "address2": "渋谷ビル101",
  "city": "渋谷区",
  "provinceCode": "JP-13",
  "zip": "150-0001",
  "countryCode": "JP",
  "phone": "03-1234-5678",
  "company": "株式会社サンプル"
}
```

### 顧客検索APIレスポンス

`GET /apps/operator-panel/proxy/customers?query=...`

```json
{
  "success": true,
  "customers": [
    {
      "id": "gid://shopify/Customer/123456789",
      "firstName": "太郎",
      "lastName": "山田",
      "email": "taro@example.com",
      "phone": "+81312345678",
      "createdAt": "2024-01-01T00:00:00Z",
      "numberOfOrders": 5,
      "amountSpent": {
        "amount": "50000.00",
        "currencyCode": "JPY"
      },
      "defaultAddress": {
        "address1": "渋谷区渋谷1-1-1",
        "address2": "渋谷ビル101",
        "city": "渋谷区",
        "company": "株式会社サンプル",
        "country": "Japan",
        "countryCodeV2": "JP",
        "firstName": "太郎",
        "lastName": "山田",
        "phone": "+81312345678",
        "province": "東京都",
        "provinceCode": "JP-13",
        "zip": "150-0001"
      },
      "tags": ["VIP", "リピーター"],
      "metafields": {
        "cardId": "CARD-001",
        "customerId": "CUS-12345",
        "points": 1500,
        "gender": "男性",
        "birthday": "1990-01-15"
      }
    }
  ],
  "totalCount": 1
}
```

### データ取り込みAPIリクエスト

`POST /apps/operator-panel/proxy/import-customer`

```json
{
  "operatorCustomerId": "gid://shopify/Customer/987654321",
  "sourceCustomer": {
    "id": "gid://shopify/Customer/123456789",
    "firstName": "太郎",
    "lastName": "山田",
    "defaultAddress": { ... },
    "metafields": {
      "cardId": "CARD-001",
      "customerId": "CUS-12345",
      "points": 1500,
      "gender": "男性",
      "birthday": "1990-01-15"
    }
  }
}
```

## 機能フロー

### 1. オペレーター認証

```
顧客がストアにログイン
        ↓
customer.metafields.custom.is_operator == true ?
        ↓
    Yes: オペレーターパネル表示
    No:  パネル非表示
```

### 2. 顧客検索

```
オペレーターが検索クエリ入力
        ↓
App Proxy (proxy.customers.jsx)
        ↓
GraphQL Admin API で顧客検索
        ↓
顧客一覧をカード形式で表示
```

### 3. データ取り込み

```
「この顧客データを取り込む」ボタンクリック
        ↓
確認ダイアログ表示
        ↓
App Proxy (proxy.import-customer.jsx)
        ↓
オペレーターの Customer レコードを更新:
  • メタフィールド (card_id, customer_id, points, gender, birthday)
  • operator_ordered_for_customer (追跡用)
  • shipping_address (チェックアウト用JSON)
        ↓
住所を customerAddressCreate で追加
        ↓
誕生日がない場合は metafieldsDelete で削除
        ↓
ページリロードで更新を反映
```

### 4. チェックアウト時の住所自動入力

```
オペレーターがチェックアウト開始
        ↓
Checkout UI Extension がロード
        ↓
shipping_address メタフィールドを読み取り
        ↓
shopify.applyShippingAddressChange() で配送先を自動入力
        ↓
「✓ 配送先住所を自動入力しました」メッセージ表示
```

## デフォルト値

メタフィールドに値がない場合のデフォルト値：

| フィールド | デフォルト値 |
|-----------|-------------|
| `card_id` | `"0"` |
| `customer_id` | `"0"` |
| `points` | `"0"` |
| `gender` | `"回答せず"` |
| `birthday` | メタフィールドを削除 |
| `shipping_address` | `{}` (空オブジェクト) |

## 権限スコープ

`shopify.app.toml`:

```toml
[access_scopes]
scopes = "write_products,read_customers,write_customers"
```

- `read_customers`: 顧客情報の読み取り
- `write_customers`: 顧客メタフィールドの更新

## App Proxy設定

```toml
[app_proxy]
url = "https://your-app-url.com/"
subpath = "operator-panel"
prefix = "apps"
```

エンドポイント:
- `GET /apps/operator-panel/proxy/customers` - 顧客検索
- `POST /apps/operator-panel/proxy/import-customer` - データ取り込み

## Checkout UI Extension メタフィールド設定

`extensions/customer-metafields/shopify.extension.toml`:

```toml
[[extensions.metafields]]
namespace = "custom"
key = "card_id"

[[extensions.metafields]]
namespace = "custom"
key = "customer_id"

[[extensions.metafields]]
namespace = "custom"
key = "points"

[[extensions.metafields]]
namespace = "custom"
key = "gender"

[[extensions.metafields]]
namespace = "custom"
key = "birthday"

[[extensions.metafields]]
namespace = "custom"
key = "operator_ordered_for_customer"

[[extensions.metafields]]
namespace = "custom"
key = "shipping_address"
```

## 国際化 (i18n)

デフォルト言語: **日本語**

サポート言語:
- 日本語 (`ja.default.json`)
- 英語 (`en.json`)

## セキュリティ考慮事項

1. **オペレーター認証**: `is_operator` メタフィールドで制御
2. **App Proxy認証**: `authenticate.public.appProxy()` で認証
3. **CORS設定**: 適切なヘッダーを設定
4. **Protected Customer Data**: Shopifyの保護された顧客データ要件に準拠

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# 拡張機能のデプロイ
npm run deploy

# 型チェック
npm run typecheck
```

## 今後の改善案

- [ ] 請求先住所の自動入力対応
- [ ] 複数顧客の一括取り込み
- [ ] 取り込み履歴の表示
- [ ] オペレーター操作ログ
- [ ] 顧客検索のフィルター機能強化

