// Copyright 2023-2023 CrabNebula Ltd.
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

#[path = "macos/mod.rs"]
mod platform;
pub use platform::start_drag;
