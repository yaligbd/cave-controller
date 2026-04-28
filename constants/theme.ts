/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform, StyleSheet } from "react-native";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
};

// This is where we make things look pretty using a system very similar to CSS
export const styles = StyleSheet.create({
  safeArea: {
    flex: 1, // Tells the app to take up the whole screen
    backgroundColor: "#f5f5f5",
  },
  headerContainer: {
    flexDirection: "row", // Places items side-by-side horizontally instead of stacked top-to-bottom
    justifyContent: "space-between", // Pushes the text to the left and icons to the right
    alignItems: "center", // Vertically centers everything in the header
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd", // A light grey line under the header
  },
  navOptions: {
    flexDirection: "row",
    gap: 15, // Adds space between Deploy, History, and Settings
  },
  navText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  iconButtons: {
    flexDirection: "row",
    gap: 10, // Adds space between the Wi-Fi and BLE buttons
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19, // To make a perfect circle, the borderRadius must be exactly half of the width/height!
    backgroundColor: "#007AFF", // A nice clean blue
    justifyContent: "center", // Centers the icon vertically inside the circle
    alignItems: "center", // Centers the icon horizontally inside the circle
  },
  // === NEW STYLES ===
  bodyContainer: {
    flex: 1, // Take up all available space below the header
    padding: 20, // Give some breathing room around the edges
  },
  cardWrapper: {
    marginVertical: 10,
    width: "100%", // Take up full width of bodyContainer
    height: 200, // Fixed height for the card
    // The shadow settings (iOS/Android handling this is advanced, let's keep it simple with elevation for now)
    elevation: 5, // Android shadow
  },
  cardImage: {
    flex: 1, // Occupy all space inside the cardWrapper
    justifyContent: "flex-end", // Pushes the text overlay to the bottom of the card
  },
  cardOverlay: {
    padding: 15,
    backgroundColor: "rgba(0,0,0,0.5)", // Black with 50% opacity (allows the image to peek through)
    borderBottomLeftRadius: 12, // Needs to match the image rounding
    borderBottomRightRadius: 12,
  },
  cardTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
  },
  cardSubtitle: {
    color: "#ccc", // Lighter text
    fontSize: 14,
    marginTop: 3,
  },
    container: {
    flex: 1,
  },
  label: {
    marginTop: 20,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
    borderColor: '#ccc',
    borderRadius: 8,
  },
  checkboxContainer: {
    flexDirection: 'row', 
    alignItems: 'center',
    marginTop: 20,
  },
  checkboxLabel: {
    marginLeft: 10,
    fontSize: 16,
  },
});

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
