"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// เกณฑ์แจ้งเตือนสต๊อกใกล้หมด
const LOW_STOCK_THRESHOLD = 5;

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setProducts(data);
      setError("");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const qtyNumber = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct ? selectedProduct.price * qtyNumber : 0;

  // --- ส่วนที่เพิ่ม: ฟังก์ชันยิงข้อความแจ้งเตือนเข้า Telegram ผ่าน API Route ---
  // ทำงานแบบ async/try-catch แยกจาก flow หลัก ถ้า error จะไม่กระทบการขาย
  const sendTelegramMessage = async (text) => {
    try {
      await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      // แค่ log ไว้ ไม่ throw ต่อ เพื่อไม่ให้กระทบระบบขาย
      console.error("ส่งแจ้งเตือน Telegram ไม่สำเร็จ:", err);
    }
  };

  // --- ส่วนที่เพิ่ม: ประกอบข้อความแจ้งเตือน "มีรายการขายใหม่" + เช็คสต๊อกใกล้หมด ---
  const notifyTelegramAfterSale = async (product, qty, total, newStock) => {
    const time = new Date().toLocaleString("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const orderMessage =
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `- สินค้า: ${product.name}\n` +
      `- จำนวน: ${qty} ชิ้น\n` +
      `- ราคารวม: ${total} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ชิ้น\n` +
      `- เวลา: ${time}`;

    await sendTelegramMessage(orderMessage);

    // ถ้าสต๊อกเหลือน้อยกว่าหรือเท่ากับเกณฑ์ ให้ยิงข้อความเตือนภัยเพิ่มอีกฉบับ
    if (newStock <= LOW_STOCK_THRESHOLD) {
      const lowStockMessage =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `- สินค้า: ${product.name}\n` +
        `- คงเหลือเพียง: ${newStock} ชิ้น\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

      await sendTelegramMessage(lowStockMessage);
    }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!selectedProduct) {
      alert("กรุณาเลือกสินค้า");
      return;
    }
    if (qtyNumber <= 0) {
      alert("กรุณากรอกจำนวนให้ถูกต้อง");
      return;
    }
    if (qtyNumber > selectedProduct.stock) {
      alert(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`
      );
      return;
    }

    setSubmitting(true);

    const { error: saleError } = await supabase.from("sales").insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qtyNumber,
        total_price: totalPrice,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      alert("บันทึกการขายไม่สำเร็จ: " + saleError.message);
      setSubmitting(false);
      return;
    }

    const newStock = selectedProduct.stock - qtyNumber;
    const { error: updateError } = await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", selectedProduct.id);

    if (updateError) {
      alert("อัปเดตสต็อกไม่สำเร็จ: " + updateError.message);
      setSubmitting(false);
      return;
    }

    // --- ส่วนที่เพิ่ม: ยิงแจ้งเตือน Telegram หลังตัดสต๊อกสำเร็จ ---
    // ไม่ await แบบบล็อก flow หลัก และห่อด้วย try-catch ผ่านฟังก์ชันด้านบนแล้ว
    // เพื่อไม่ให้ error จาก Telegram กระทบข้อความ "ขายสำเร็จ" บนเว็บ
    notifyTelegramAfterSale(selectedProduct, qtyNumber, totalPrice, newStock);

    setMessage(
      `ขายสำเร็จ: ${selectedProduct.name} จำนวน ${qtyNumber} ${selectedProduct.unit} รวม ${totalPrice} บาท`
    );
    setSelectedProductId("");
    setQuantity("");
    setSubmitting(false);

    fetchProducts();
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {loading && <p>กำลังโหลดข้อมูลสินค้า...</p>}
      {error && <p style={{ color: "red" }}>เกิดข้อผิดพลาด: {error}</p>}

      {!loading && !error && (
        <div className="card">
          <form
            onSubmit={handleSell}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div>
              <label>สินค้า: </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.price} บาท) - คงเหลือ{" "}
                    {product.stock} {product.unit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>จำนวน: </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div>
              <strong>ยอดรวม: {totalPrice.toFixed(2)} บาท</strong>
            </div>

            <button type="submit" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ขาย"}
            </button>
          </form>

          {message && (
            <p style={{ color: "green", marginTop: "12px" }}>{message}</p>
          )}
        </div>
      )}
    </div>
  );
}
