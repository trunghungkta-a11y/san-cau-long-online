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

Dự án dùng project Firebase riêng `san-cau-long-online` (tách hẳn khỏi chùa online: khác cơ sở dữ liệu,
khác tên miền đăng nhập `san-cau-long-online.firebaseapp.com`). Cấu hình đã có trong `js/config.js`.

Đã thiết lập trong Firebase Console:

1. Authentication → Sign-in method → Anonymous: bật.
2. Authentication → Settings → Authorized domains: thêm `trunghungkta-a11y.github.io`.
3. Realtime Database (Singapore, asia-southeast1), Rules = nội dung `database.rules.json`
   (chỉ nhánh `badminton`, đọc/ghi khi đã đăng nhập ẩn danh).

Khi thiếu một trong các bước trên, trang tự chuyển về chế độ cục bộ và băng vàng phía trên ghi rõ thiếu gì.

GitHub Pages: Settings → Pages → Branch `main`, thư mục `/ (root)`.
Địa chỉ: https://trunghungkta-a11y.github.io/san-cau-long-online/

## Cách chơi

| Vai | Làm gì |
|---|---|
| Chủ sân | Người đến trước bấm vào sân trống. Chọn **đơn/đôi** và số điểm (11/15/21), thêm người hoặc máy, bấm bắt đầu. |
| Vận động viên | Vào chỗ trống trong đội đỏ/xanh. |
| Trọng tài biên 1, 2 | Sau khi cầu rơi, xem vòng vàng so với vạch và gọi IN (`Z`) hoặc OUT (`X`). Chỗ không có người thì máy tự chấm. |
| Khán giả | Xem, đổi góc nhìn bằng nút "Góc nhìn" hoặc phím `V`. |

### Bình luận

Nút **💬 Bình luận** trên thanh trên mở/đóng khung bình luận (máy tính mở sẵn, điện thoại đóng sẵn).
Có hai kênh: **Sảnh** cho mọi người trong nhà thi đấu, và **Sân N** cho những ai đang ở sân đó
(vận động viên, trọng tài biên, khán giả). Tin trong kênh sân ghi kèm vai: Chủ sân, VĐV, TT biên, Khán giả.
Số đỏ trên nút là tin chưa đọc. Mỗi kênh hiện 60 tin gần nhất, tối đa 300 ký tự mỗi tin, cách nhau ít nhất 1,5 giây.
Đang gõ trong ô bình luận thì phím `SPACE`, `WASD`, `1`–`5` không điều khiển vận động viên.

**Nói bậy bị sét đánh.** Danh sách từ bậy lấy theo chùa online, nằm trong `js/tubay.js` (sửa trực tiếp trên GitHub).
Chỉ bắt nguyên từ hoặc cụm từ, không phân biệt hoa thường, phải đúng dấu. Tin có từ bậy bị che bằng `*`,
gắn nhãn "Nói bậy, đã bị sét đánh", và mọi người đang xem thấy sét giáng xuống avatar người gõ
(VĐV, trọng tài hay khán giả ở rìa sân), avatar cháy đen 3 giây, có tiếng sấm. Người gõ ở ngoài sảnh
(chưa vào sân nào) thì cả nhà thi đấu chớp sáng.

### Khán giả

Người chọn "Xem trận" hiện thành người màu tím đứng dọc hai biên dọc của sân, có bảng tên phía trên
(tên mình màu xanh chanh). Mỗi sân xếp được 18 người, quá số đó thì hiện nhãn "+N người xem".
Bảng sân liệt kê tên khán giả; thẻ sân ở sảnh ghi số người xem 👀.

### Điều khiển vận động viên (máy tính)

| Thao tác | Phím |
|---|---|
| Di chuyển | `WASD` hoặc phím mũi tên |
| **Hướng** đánh | Di chuột tới điểm muốn cầu rơi trên sân đối phương |
| **Góc** đánh | `1`–`5` (Đập, Tạt, Cắt, Phông, Lốp), `Q`/`E` hoặc lăn chuột để tinh chỉnh |
| **Lực** | Giữ `SPACE` (hoặc nhấn giữ chuột): thanh lực đầy dần trong 1 giây |
| **Thời điểm** | Nhả `SPACE` đúng lúc vạch trắng chạy qua vùng xanh trên thanh thời gian |
| Giao cầu | Giữ rồi nhả `SPACE` để tung cầu (lực chọn lúc này), nhấn rồi nhả lần nữa đúng vạch xanh để đánh |

Thanh thời gian chỉ xuất hiện khi cầu bay vào tầm với (vòng trắng quanh chân). Vòng cyan trên sân là điểm rơi dự đoán.
Đánh lệch thời điểm thì cú đánh bị lệch hướng, lệch góc và sai lực: vùng xanh đậm là hoàn hảo, xanh nhạt là tốt.

Hai tuỳ chọn trong thanh điều khiển:

- **Trợ lực**: tự tính lực và tự nâng góc để cầu qua lưới và rơi đúng điểm chọn. Tắt đi thì tự căn lực bằng thời gian giữ phím.
- **Đường bay**: hiện đường bay dự đoán (xanh: trong sân, vàng: ra ngoài, đỏ: vướng lưới).

### Điều khiển trên điện thoại

Máy cảm ứng tự chuyển sang cách chơi riêng (muốn thử trên máy tính thì thêm `?touch` vào địa chỉ).
Cách làm theo các game thể thao trên điện thoại: một tay di chuyển, một tay vuốt để đánh, cần ảo hiện tại chỗ đặt ngón.

| Thao tác | Cách làm |
|---|---|
| Di chuyển | Mặc định **Tự chạy**: vận động viên tự chạy tới điểm đón cầu, đánh xong tự về giữa nửa sân. Muốn tự chạy tay thì đặt ngón bất kỳ đâu ở **nửa trái** màn hình và kéo (cần ảo nổi, có vùng chết ở tâm). Tắt ô "Tự chạy" để luôn chạy tay. |
| Hướng + độ sâu | **Vuốt ở nửa phải**: vuốt lên = đánh sâu (vuốt càng dài càng sâu), lệch trái/phải = đánh chéo, vuốt xuống = đập. Chạm rồi nhả không vuốt = giữ hướng cũ. Vòng trắng và đường bay hiện ngay khi đang vuốt. |
| Góc đánh | Dải nút bên phải: **Tự** (mặc định, tự chọn theo độ sâu, độ cao chạm cầu và kiểu vuốt), Đập, Tạt, Cắt, Phông, Lốp. |
| Thời điểm | Lúc **nhấc ngón** là lúc đánh, căn theo vạch xanh như trên máy tính. Nhấc sớm tối đa 0,4 giây vẫn được tính: cầu vào tầm sẽ tự đánh nhưng chất lượng thấp hơn. |
| Giao cầu | Vuốt lần đầu để tung cầu (hướng vuốt = hướng giao), chạm rồi nhả lần hai đúng vạch xanh để đánh. |

Trợ lực luôn bật sẵn trên điện thoại. Máy rung nhẹ khi đánh trúng, rung mạnh khi chính mình bị sét đánh.
Màn hình dọc thì góc nhìn mở rộng và camera nâng cao hơn để thấy hết bề ngang sân.

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
js/tubay.js         danh sách từ bậy trong bình luận
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

Nhánh dữ liệu: `badminton/courts/<0-8>` (sân, người chơi, trọng tài, ván đấu), `pos`, `shots`, `intents`, `calls`,
`chat/hall` và `chat/c<0-8>` (bình luận). Rules chỉ cho thêm tin mới, không cho sửa hay xoá tin của người khác,
và kiểm tra tên ≤ 14 ký tự, nội dung ≤ 300 ký tự, mã người gửi khớp tài khoản ẩn danh.

## Giới hạn cần biết

- Máy của chủ sân chạy bộ điều hành, nên cần giữ tab của chủ sân mở và hiển thị. Chủ sân thoát thì sân đóng.
- Bình luận chưa có kiểm duyệt; muốn xoá tin thì vào Firebase Console → Realtime Database → `badminton/chat`.
- Đăng nhập ẩn danh nên Rules chỉ chặn được người không qua trang (`auth != null`); ai mở trang cũng ghi được vào nhánh `badminton`.
- Độ trễ mạng cộng thêm vào thời gian từ lúc nhả phím đến lúc thấy cầu bay (thời điểm đánh vẫn được tính theo lúc nhả phím).

## Test

```bash
node tests/rules.test.mjs        # luật + vật lý
node tests/host-sim.mjs doubles 60   # hai đội máy đấu nhau
VENDOR=<thư mục có node_modules/three> OUT=out python3 tests/chat-e2e.py     # khung bình luận
VENDOR=<thư mục có node_modules/three> OUT=out python3 tests/mobile-e2e.py   # điện thoại, khán giả, sét đánh
```
