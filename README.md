# Sân cầu lông online

Nhà thi đấu 3D gồm 9 sân. Mỗi sân có 2 trọng tài biên, chơi đơn hoặc đôi, thời gian thực.
Web tĩnh (HTML + Three.js), dữ liệu đồng bộ qua Firebase Realtime Database, đặt được trên GitHub Pages
giống dự án chùa online.

## Chạy thử ngay (không cần Firebase)

Thêm `?local` vào địa chỉ (hoặc để trống `js/config.js`) thì trang chạy ở chế độ cục bộ: nhiều tab trong cùng một trình duyệt chơi với nhau
qua BroadcastChannel. Dùng để thử luật và điều khiển.

```bash
python3 -m http.server 8000      # rồi mở http://localhost:8000/?local
```

Mở một tab, nhận sân 1, bấm "+ Máy" để thêm đối thủ máy rồi "Bắt đầu trận". Mở thêm tab khác để làm trọng tài biên
hoặc khán giả.

## Chơi qua mạng (Firebase)

`js/config.js` đang dùng chung project Firebase `chua-dang-khoa` với chùa online. Dữ liệu sân cầu lông nằm riêng
dưới nhánh `badminton`, không đụng dữ liệu của chùa. Trang đăng nhập ẩn danh giống chùa online, nên đã bật
Anonymous và tên miền `<tên-github>.github.io` cho chùa thì không cần làm lại.

Việc cần làm một lần trong Firebase Console:

1. Realtime Database → Rules: giữ nguyên nhánh `chua`, thêm nhánh `badminton` trong `database.rules.json`
   ngang hàng với nó (trong `"rules": { ... }`) → Publish.
2. Nếu dùng project khác: bật Authentication → Sign-in method → Anonymous, thêm tên miền GitHub Pages vào
   Authentication → Settings → Authorized domains, rồi dán `firebaseConfig` vào `js/config.js`.

Khi thiếu một trong các bước trên, trang tự chuyển về chế độ cục bộ và băng vàng phía trên ghi rõ thiếu gì.

GitHub Pages: Settings → Pages → Branch `main`, thư mục `/ (root)`.

## Cách chơi

| Vai | Làm gì |
|---|---|
| Chủ sân | Người đến trước bấm vào sân trống. Chọn **đơn/đôi** và số điểm (11/15/21), thêm người hoặc máy, bấm bắt đầu. |
| Vận động viên | Vào chỗ trống trong đội đỏ/xanh. |
| Trọng tài biên 1, 2 | Sau khi cầu rơi, xem vòng vàng so với vạch và gọi IN (`Z`) hoặc OUT (`X`). Chỗ không có người thì máy tự chấm. |
| Khán giả | Xem, đổi góc nhìn bằng nút "Góc nhìn" hoặc phím `V`. |

### Điều khiển vận động viên

| Thao tác | Phím |
|---|---|
| Di chuyển | `WASD` hoặc phím mũi tên (điện thoại: cần ảo bên trái) |
| **Hướng** đánh | Di chuột tới điểm muốn cầu rơi trên sân đối phương |
| **Góc** đánh | `1`–`5` (Đập, Tạt, Cắt, Phông, Lốp), `Q`/`E` hoặc lăn chuột để tinh chỉnh |
| **Lực** | Giữ `SPACE` (hoặc nhấn giữ chuột): thanh lực đầy dần trong 1 giây |
| **Thời điểm** | Nhả `SPACE` đúng lúc vạch trắng chạy qua vùng xanh trên thanh thời gian |
| Giao cầu | Giữ rồi nhả `SPACE` để tung cầu (lực chọn lúc này), nhấn rồi nhả lần nữa đúng vạch xanh để đánh |

Thanh thời gian chỉ xuất hiện khi cầu bay vào tầm với (vòng trắng quanh chân). Vòng cyan trên sân là điểm rơi dự đoán.
Đánh lệch thời điểm thì cú đánh bị lệch hướng, lệch góc và sai lực: vùng xanh đậm là hoàn hảo, xanh nhạt là tốt.

Hai tuỳ chọn trong thanh điều khiển:

- **Trợ lực**: tự tính lực và tự nâng góc để cầu qua lưới và rơi đúng điểm chuột chọn. Tắt đi thì tự căn lực bằng thời gian giữ phím.
- **Đường bay**: hiện đường bay dự đoán (xanh: trong sân, vàng: ra ngoài, đỏ: vướng lưới).

### Luật đã cài

- Tính điểm rally đến 11/15/21, hơn 2 điểm, trần = điểm đích + 9.
- Giao cầu chéo sân: điểm chẵn giao từ ô phải, lẻ giao từ ô trái. Cầu giao phải qua vạch giao ngắn;
  đôi giới hạn bởi vạch giao dài đôi, đơn được giao sâu tới vạch cuối.
- Đôi: đội giao thắng thì hai người đổi ô, đội đỡ thắng thì giành quyền giao. Mỗi đội đánh một lần mỗi lượt cầu.
- Biên đơn/đôi theo kích thước thật (đơn rộng 5,18 m, đôi 6,1 m, dài 13,4 m). Cầu chạm vạch tính là IN.
- Cầu vướng lưới: mất điểm. Giao cầu cao quá hông (1,15 m) hoặc hụt cầu tung 3 lần: lỗi giao cầu.
- Hai trọng tài cùng gọi một kết quả thì tính theo đó. Gọi khác nhau thì đánh lại.

## Kiến trúc

```
index.html          giao diện
css/style.css
js/config.js        cấu hình Firebase
js/backend.js       Firebase hoặc BroadcastChannel (cùng giao diện)
js/physics.js       vật lý quả cầu, cửa sổ đánh, chấm IN/OUT (module thuần)
js/rules.js         tính điểm, luân phiên giao cầu (module thuần)
js/host.js          bộ điều hành trận, chạy trên máy chủ sân; có bot
js/scene.js         Three.js: nhà thi đấu 9 sân, vận động viên, lưới, quả cầu
js/app.js           sảnh, vai trò, điều khiển, bảng điểm
tests/              test luật/vật lý (node) và kịch bản E2E (Playwright)
```

Cách đồng bộ: người chơi chỉ gửi ý định đánh (thời điểm nhả phím, lực, góc, hướng). Máy chủ sân kiểm tra tầm với
và thời điểm, tính vận tốc xuất phát rồi ghi một sự kiện `shots/<sân>`. Mọi máy tự mô phỏng quỹ đạo từ sự kiện đó
bằng cùng một bước thời gian cố định nên không cần truyền vị trí cầu từng khung hình.

Nhánh dữ liệu: `badminton/courts/<0-8>` (sân, người chơi, trọng tài, ván đấu), `pos`, `shots`, `intents`, `calls`.

## Giới hạn cần biết

- Máy của chủ sân chạy bộ điều hành, nên cần giữ tab của chủ sân mở và hiển thị. Chủ sân thoát thì sân đóng.
- Đăng nhập ẩn danh nên Rules chỉ chặn được người không qua trang (`auth != null`); ai mở trang cũng ghi được vào nhánh `badminton`.
- Độ trễ mạng cộng thêm vào thời gian từ lúc nhả phím đến lúc thấy cầu bay (thời điểm đánh vẫn được tính theo lúc nhả phím).

## Test

```bash
node tests/rules.test.mjs        # luật + vật lý
node tests/host-sim.mjs doubles 60   # hai đội máy đấu nhau
```
