# Operator Panel - Shopify Theme App Extension

CSオペレーター向けの代理注文パネル。オペレーターが顧客を検索し、ゲストチェックアウトで代理注文を行うためのShopify拡張機能。

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
│  │  • 顧客検索          │    │  • カート属性から顧客情報表示   ││
│  │  • オペレーター名入力│    │  • 配送先住所自動入力           ││
│  │  • カート属性設定    │    │  • オペレーター注文表示         ││
│  └──────────┬───────────┘    └────────────────┬────────────────┘│
│             │                                 │                 │
│             │        App Proxy                │                 │
│             ▼                                 │                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Remix Backend                            ││
│  │  • proxy.customers.jsx  (顧客検索API)                       ││
│  │  • proxy.import-customer.jsx (データ取り込みAPI)            ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  Payment Function (cc-ivr)                  ││
│  │  • オペレーター名がある場合のみ「クレカIVR」表示            ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Shopify GraphQL Admin API                   ││
│  │  • Customer Query                                           ││
│  │  • Payment Customization Mutations                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 主な機能

### 1. ゲストモードでの代理注文

オペレーターはログインせずに（ゲストモードで）顧客を検索し、代理注文を行えます。選択した顧客情報はカート属性として保存され、チェックアウト時に自動入力されます。

### 2. カート属性による情報伝達

顧客情報はカート属性として保存され、Checkout UI Extension で読み取られます：

| 属性キー | 説明 |
|----------|------|
| `operator_name` | オペレーター名（必須：クレカIVR決済に必要） |
| `operator_order_for_customer_id` | 対象顧客のShopify ID |
| `operator_order_for_customer_email` | 対象顧客のメールアドレス |
| `operator_order_for_customer_name` | 対象顧客の氏名 |
| `operator_order_for_customer_phone` | 対象顧客の電話番号 |
| `operator_order_for_card_id` | 会員カードID |
| `operator_order_for_customer_code` | 顧客コード |
| `operator_order_for_points` | ポイント残高 |
| `operator_order_for_gender` | 性別 |
| `operator_order_for_birthday` | 生年月日 |
| `operator_order_shipping_address` | 配送先住所（JSON文字列） |

### 3. 配送先住所の自動入力

Checkout UI Extension が `operator_order_shipping_address` カート属性を読み取り、`shopify.applyShippingAddressChange()` APIで配送先を自動入力します。

### 4. クレカIVR決済の条件付き表示

Payment Function（cc-ivr）により、`operator_name` カート属性が設定されている場合のみ「クレカIVR」決済オプションが表示されます。

## ディレクトリ構成

```
operator-panel/
├── app/
│   └── routes/
│       ├── app.jsx                    # 管理画面レイアウト
│       ├── app.payment-functions.jsx  # Payment Function管理画面
│       ├── proxy.customers.jsx        # 顧客検索 App Proxy
│       └── proxy.import-customer.jsx  # データ取り込み App Proxy
├── extensions/
│   ├── operator-panel-ui/             # Theme App Extension
│   │   ├── blocks/
│   │   │   └── customer_panel.liquid  # オペレーターパネルUI
│   │   └── locales/
│   │       ├── ja.default.json        # 日本語 (デフォルト)
│   │       └── en.json                # 英語
│   ├── customer-metafields/           # Checkout UI Extension
│   │   ├── src/
│   │   │   └── Checkout.jsx           # チェックアウトUI
│   │   └── locales/
│   │       ├── ja.default.json
│   │       └── en.json
│   └── cc-ivr/                        # Payment Function
│       ├── src/
│       │   ├── cart_payment_methods_transform_run.js
│       │   └── cart_payment_methods_transform_run.graphql
│       └── shopify.extension.toml
└── shopify.app.toml                   # アプリ設定
```

## 機能フロー

### 1. 顧客検索と選択

```
オペレーターがストアにアクセス（ログイン不要）
        ↓
オペレーターパネルが表示される
        ↓
オペレーター名を入力
        ↓
顧客を検索（メール、名前等）
        ↓
検索結果から顧客を選択
        ↓
「この顧客を選択」ボタンをクリック
        ↓
カート属性に顧客情報が設定される
```

### 2. チェックアウト

```
オペレーターがチェックアウトに進む
        ↓
Checkout UI Extension がロード
        ↓
カート属性から顧客情報を読み取り表示
        ↓
配送先住所を自動入力（applyShippingAddressChange）
        ↓
オペレーター名があれば「クレカIVR」決済が表示
        ↓
注文完了
```

### 3. Payment Function の動作

```
チェックアウト時に Payment Function が実行
        ↓
cart.attribute(key: "operator_name") を確認
        ↓
operator_name が存在 && 空でない
    → クレカIVR を表示（何もしない）
        ↓
operator_name が存在しない || 空
    → クレカIVR を非表示（paymentMethodHide）
```

## データ構造

### shipping_address JSON構造

```json
{
  "firstName": "太郎",
  "lastName": "山田",
  "address1": "渋谷区渋谷1-1-1",
  "address2": "渋谷ビル101",
  "city": "渋谷区",
  "province": "東京都",
  "provinceCode": "JP-13",
  "zip": "150-0001",
  "country": "Japan",
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
      "numberOfOrders": 5,
      "amountSpent": {
        "amount": "50000.00",
        "currencyCode": "JPY"
      },
      "defaultAddress": {
        "firstName": "太郎",
        "lastName": "山田",
        "address1": "渋谷区渋谷1-1-1",
        "address2": "渋谷ビル101",
        "city": "渋谷区",
        "province": "東京都",
        "provinceCode": "JP-13",
        "zip": "150-0001",
        "country": "Japan",
        "countryCodeV2": "JP",
        "phone": "+81312345678",
        "company": "株式会社サンプル"
      },
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

## 権限スコープ

`shopify.app.toml`:

```toml
[access_scopes]
scopes = "write_products,read_customers,write_customers,read_payment_customizations,write_payment_customizations,unauthenticated_read_checkouts,unauthenticated_write_checkouts"
```

| スコープ | 用途 |
|----------|------|
| `read_customers` | 顧客情報の読み取り |
| `write_customers` | 顧客メタフィールドの更新 |
| `read_payment_customizations` | Payment Function の読み取り |
| `write_payment_customizations` | Payment Function の登録・更新 |
| `unauthenticated_read_checkouts` | チェックアウト情報の読み取り |
| `unauthenticated_write_checkouts` | チェックアウト情報の書き込み |

## App Proxy設定

```toml
[app_proxy]
url = "https://your-app-url.com/"
subpath = "operator-panel"
prefix = "apps"
```

エンドポイント:
- `GET /apps/operator-panel/proxy/customers` - 顧客検索
- `POST /apps/operator-panel/proxy/import-customer` - データ取り込み（オペレーターログイン時）

## Payment Function 設定

### 1. デプロイ

```bash
shopify app deploy
```

### 2. 登録

管理画面の「Payment Functions」ページで「Register」ボタンをクリック、または GraphQL で登録：

```graphql
mutation {
  paymentCustomizationCreate(paymentCustomization: {
    title: "CC IVR - Operator Only"
    functionHandle: "cart-payment-methods-transform-run"
    enabled: true
  }) {
    paymentCustomization {
      id
      title
      enabled
    }
    userErrors {
      field
      message
    }
  }
}
```

### 3. 動作確認

- オペレーター名を入力して顧客を選択 → チェックアウトで「クレカIVR」が表示される
- オペレーター名なしでチェックアウト → 「クレカIVR」が非表示

## 国際化 (i18n)

デフォルト言語: **日本語**

サポート言語:
- 日本語 (`ja.default.json`)
- 英語 (`en.json`)

## 開発コマンド

```bash
# 開発サーバー起動
shopify app dev

# 拡張機能のデプロイ
shopify app deploy

# Payment Function テスト
cd extensions/cc-ivr && npm test
```

## 注意事項

### メールアドレスの手動入力

現在、チェックアウト時のメールアドレスは自動入力されません。オペレーターが手動で入力する必要があります。

※ Shopify Checkout UI Extensions API には、メールフィールドをプログラムで設定する機能がありません。

### Payment Function のデプロイ

Payment Function は `shopify app dev` では動作しません。本番環境で使用するには `shopify app deploy` でデプロイが必要です。

## トラブルシューティング

### クレカIVRが表示されない

1. Payment Function がデプロイされているか確認
2. Payment Customization が登録・有効化されているか確認（管理画面 > Payment Functions）
3. オペレーター名が入力されているか確認
4. CLI ログで `[cc-ivr] Operator order detected` メッセージを確認

### 配送先住所が自動入力されない

1. 顧客に `defaultAddress` が設定されているか確認
2. Checkout UI Extension が正しくロードされているか確認
3. ブラウザコンソールでエラーを確認

### 顧客検索ができない

1. App Proxy の URL 設定を確認
2. `shopify.app.toml` の app_proxy 設定を確認
3. 開発サーバーが起動しているか確認
