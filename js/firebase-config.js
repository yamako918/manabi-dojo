/* ============================================================
   Firebase 設定ファイル
   ------------------------------------------------------------
   Firebaseコンソール → プロジェクトの設定（歯車アイコン）→ 全般
   → 「マイアプリ」→ Webアプリ の設定画面に表示される
   firebaseConfig の中身を、下の FIREBASE_CONFIG にそのまま貼り付けてください。

   この値そのものが漏れても実害はありません（Web用のAPIキーは
   「このアプリがどのFirebaseプロジェクトと話すか」を示す識別情報であり、
   実際のアクセス制御は firestore.rules （セキュリティルール）側で
   行うのがFirebaseの標準的な設計です）。

   このファイルを書き換えない限り、クラウド連携機能（みんなの記録・
   応援スタンプ）は自動的に無効化され、それ以外のアプリの機能には
   一切影響しません。
   ============================================================ */

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyApL0chaTWesdniF92fnqLhsNahmIl1iNU",
    authDomain: "manabi-dojo.firebaseapp.com",
    projectId: "manabi-dojo",
    storageBucket: "manabi-dojo.firebasestorage.app",
    messagingSenderId: "976077746424",
    appId: "1:976077746424:web:20de481b737a946aad0b0d"
  };
