import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "プライバシーポリシー | Order Notify for LINE WORKS" },
  ];
};

export default function Privacy() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.7 }}>
      <h1 style={{ borderBottom: "2px solid #333", paddingBottom: "10px" }}>プライバシーポリシー</h1>

      <p><strong>最終更新日</strong>: 2026年2月8日</p>

      <p>
        Order Notify for LINE WORKS（以下「本アプリ」）は、お客様のプライバシーを尊重し、
        個人情報の保護に努めています。本プライバシーポリシーは、本アプリがどのような情報を収集し、
        どのように使用するかを説明します。
      </p>

      <hr style={{ margin: "30px 0" }} />

      <h2>1. 収集する情報</h2>
      <p>本アプリは、以下の情報にアクセス・保存します：</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th style={{ border: "1px solid #ddd", padding: "12px", textAlign: "left" }}>情報の種類</th>
            <th style={{ border: "1px solid #ddd", padding: "12px", textAlign: "left" }}>目的</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "12px" }}><strong>LINE WORKS API 認証情報</strong></td>
            <td style={{ border: "1px solid #ddd", padding: "12px" }}>LINE WORKS へメッセージを送信するため</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "12px" }}><strong>注文情報</strong></td>
            <td style={{ border: "1px solid #ddd", padding: "12px" }}>通知メッセージに注文番号・金額・商品名を含めるため</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "12px" }}><strong>Webhook 設定</strong></td>
            <td style={{ border: "1px solid #ddd", padding: "12px" }}>通知の送信先やメッセージテンプレートを保存するため</td>
          </tr>
        </tbody>
      </table>

      <h3>収集しない情報</h3>
      <p>本アプリは以下の情報を <strong>収集・保存しません</strong>：</p>
      <ul>
        <li>顧客の個人情報（住所、電話番号、メールアドレス等）の永続的な保存</li>
        <li>顧客の支払い情報</li>
        <li>アクセス解析データ</li>
      </ul>
      <p>※ 通知メッセージに顧客名を含める場合がありますが、これは一時的な処理であり、保存はしません。</p>

      <hr style={{ margin: "30px 0" }} />

      <h2>2. 情報の使用目的</h2>
      <p>収集した情報は、以下の目的のみに使用されます：</p>
      <ul>
        <li>LINE WORKS への注文・発送通知の送信</li>
        <li>通知設定（送信先、メッセージテンプレート）の管理</li>
        <li>送信履歴の記録（トラブルシューティング用）</li>
      </ul>

      <hr style={{ margin: "30px 0" }} />

      <h2>3. 情報の保存</h2>
      <p>
        LINE WORKS API 認証情報および Webhook 設定は、本アプリのデータベースに暗号化して保存されます。
        送信履歴は一定期間保存された後、自動的に削除されます。
      </p>

      <hr style={{ margin: "30px 0" }} />

      <h2>4. 第三者への提供</h2>
      <p>
        本アプリは、収集した情報を第三者に販売、貸与、または共有することはありません。
        ただし、LINE WORKS への通知送信のため、LINE WORKS API に対してメッセージデータを送信します。
      </p>

      <hr style={{ margin: "30px 0" }} />

      <h2>5. データの削除</h2>
      <p>
        本アプリをアンインストールすると、保存されていた LINE WORKS 認証情報および Webhook 設定は
        自動的に削除されます。データの完全削除についてご質問がある場合は、サポートまでご連絡ください。
      </p>

      <hr style={{ margin: "30px 0" }} />

      <h2>6. お問い合わせ</h2>
      <p>本プライバシーポリシーに関するご質問やご懸念がある場合は、以下までご連絡ください：</p>
      <p><strong>メール</strong>: aokinao44+support@gmail.com</p>

      <hr style={{ margin: "30px 0" }} />

      <h2>7. ポリシーの変更</h2>
      <p>
        本プライバシーポリシーは、必要に応じて更新されることがあります。
        重要な変更がある場合は、本ページにて通知いたします。
      </p>

      <hr style={{ margin: "30px 0" }} />

      <p style={{ color: "#666", fontStyle: "italic" }}>
        本プライバシーポリシーは、Order Notify for LINE WORKS アプリにのみ適用されます。
      </p>
    </div>
  );
}
