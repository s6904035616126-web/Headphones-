"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SellPage() {
  // รายการสินค้าทั้งหมด (ไว้แสดงใน dropdown)
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // สินค้าที่เลือกและจำนวนที่จะขาย
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");

  // สถานะระหว่างกำลังบันทึกการขาย + ข้อความแจ้งผล
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // โหลดรายการสินค้าจาก Supabase
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

  // หา object สินค้าที่กำลังถูกเลือกอยู่
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // คำนวณยอดรวม = ราคา x จำนวน
  const qtyNumber = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct ? selectedProduct.price * qtyNumber : 0;

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

    // ตรวจสอบ stock คงเหลือให้เพียงพอก่อนขาย
    if (qtyNumber > selectedProduct.stock) {
      alert(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`
      );
      return;
    }

    setSubmitting(true);

    // 1) บันทึกรายการขายลงตาราง sales
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

    // 2) อัปเดต stock สินค้าให้ลดลงตามจำนวนที่ขาย
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

    // สำเร็จ: แจ้งเตือนและรีเซ็ตฟอร์ม
    setMessage(
      `ขายสำเร็จ: ${selectedProduct.name} จำนวน ${qtyNumber} ${selectedProduct.unit} รวม ${totalPrice} บาท`
    );
    setSelectedProductId("");
    setQuantity("");
    setSubmitting(false);

    // โหลดรายการสินค้าใหม่เพื่ออัปเดต stock ที่แสดงผล
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
            {/* Dropdown เลือกสินค้า */}
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

            {/* ช่องกรอกจำนวน */}
            <div>
              <label>จำนวน: </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {/* แสดงยอดรวมอัตโนมัติ */}
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
