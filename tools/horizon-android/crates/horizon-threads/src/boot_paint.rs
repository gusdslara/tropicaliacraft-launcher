//! The game window's boot screen before wgpu's first frame: the renderer's
//! device and pipelines take seconds to build, and winit's window sits white
//! until a frame is presented. This paints it pure black with GDI and nothing
//! else: the boot sequence itself (`ui_theme::draw_boot`: the TropicaliaCraft
//! logo splash, then the creeper and the "loading the game" notice) starts
//! with the first wgpu frame, so the splash is always the first thing seen
//! and is never preceded by text or console lines.

use windows_sys::Win32::Foundation::{HWND, RECT};
use windows_sys::Win32::Graphics::Gdi::{
    CreateSolidBrush, DeleteObject, FillRect, GetDC, ReleaseDC,
};
use windows_sys::Win32::UI::WindowsAndMessaging::GetClientRect;

/// Paints the client area of the window at `hwnd` pure black.
///
/// `semibold`, `mono` and `logs` are kept for the caller's signature (the
/// earlier design drew a wordmark and the console here); they are unused now.
/// Repainting is safe and cheap (a background thread calls this every few
/// hundred milliseconds until the renderer presents).
pub fn paint(hwnd: isize, semibold: &[u8], mono: &[u8], logs: &[String]) {
    let _ = (semibold, mono, logs);
    let hwnd = hwnd as HWND;
    unsafe {
        let hdc = GetDC(hwnd);
        if hdc.is_null() {
            return;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        GetClientRect(hwnd, &mut rect);
        let brush = CreateSolidBrush(0);
        FillRect(hdc, &rect, brush);
        let _ = DeleteObject(brush);
        let _ = ReleaseDC(hwnd, hdc);
    }
}
