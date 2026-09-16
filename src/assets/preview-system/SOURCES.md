# Preview-only system app icons

Refreshed 2026-09-16. Used only for the nonfunctional system-app buttons in the
desktop test shell, not NAVA branding; excluded by the native dependency graph.
NAVA uses its existing native AppIcon. No user screenshot or notification is used.

## Current artwork

Source page: [Apps by Apple](https://www.apple.com/apps/). These are Apple's
classic marketing assets, not a claim of pixel-identical iOS 18 OS resources.
Files are downloaded unchanged, not screenshot crops or generated/upscaled art.
144px originals contain a 100px icon at (22,22); 128px originals contain a 100px
icon at (14,13). `SystemIconArt` frames those margins in CSS without a white
backing, preserving aspect ratio and shared visible bounds across grid/Dock.

| File | Original Apple asset (under https://www.apple.com/v/apps/f/images/overview/apps/) | Native PNG |
| --- | --- | --- |
| camera.png | tier1/chiclets/camera_chiclet__durqmihra2s2_xlarge_2x.png | 144×144 |
| messages.png | tier1/chiclets/messages_chiclet__f8bzind6fdqy_xlarge_2x.png | 144×144 |
| notes.png | tier1/chiclets/notes_chiclet__clow1nl1x7bm_xlarge_2x.png | 144×144 |
| weather.png | tier1/chiclets/weather_chiclet__85gxx6e7lnmm_xlarge_2x.png | 144×144 |
| contacts.png | tier1/chiclets/contacts_chiclet__bfsq7qs1ptjm_xlarge_2x.png | 144×144 |
| phone.png | tier1/chiclets/phone_chiclet__f1brppw3aqy6_xlarge_2x.png | 144×144 |
| settings.png | tier2/settings_chiclet__dr80i4otdb6u_large_2x.png | 128×128 |
| clock.png | tier2/clock_chiclet__rmcv0em78d6e_large_2x.png | 128×128 |

Calendar is live UI text (local weekday/date, not a static image). Its short
Chinese weekday and inset proportions, and the flat vector Mail UI icon, follow
the [official iOS 18 Home Screen](https://support.apple.com/zh-cn/guide/iphone/iphca3d8b4e3/18.0/ios/18.0).
The shaded cross-platform marketing Mail icon is deliberately not used.
Clock is a static reference icon; it is not an OS clock implementation.

Apple artwork remains Apple's copyrighted material, not an open-license pack or
NAVA intellectual property. Public availability is not a redistribution license;
review reuse permission before distributing this test shell as a separate product.
See [Apple terms](https://www.apple.com/legal/internet-services/terms/site.html).

## Superseded guide thumbnails (provenance)

Original 60px guide illustrations had presentation outlines and were too small
for this use. The eight files above replace them. `mail.png` is retained for
provenance but is no longer imported or shipped by this component.

Asset origin: `https://help.apple.com/assets/683A54F5227CBBDB98051B96/683A54FB41CF56AD7E0D23DC/zh_CN/`

| File | Original filename | Origin PNG |
| --- | --- | --- |
| camera.png | IL_CameraAppIcon | de26b8cef467bff3fb0e82c194a55e94.png |
| messages.png | IL_Messages | 14e93dcde4ada323a55aa1c05792208f.png |
| settings.png | IL_Settings | 88b2400e45bcf521514b7252cbb2d959.png |
| mail.png | IL_Mail | abca7cecea67b5339687df71fe9f4cf7.png |
| notes.png | IL_Notes | e6fd7d53dd1287d2739e3ee10e04cffa.png |
| weather.png | IL_WeatherAppIcon | 013484ba54c063f64057bfb59e50d64c.png |
| clock.png | IL_Clock | 7a910308334aaa979bf956ea18a5c830.png |
| contacts.png | IL_Contacts | d76c8c891b3a351267e761f3c92fe2f3.png |
| phone.png | IL_Phone | 034a2e317f7992b0c223c435801520a5.png |

Source pages: [Camera](https://support.apple.com/zh-cn/guide/iphone/iph263472f78/18.0/ios/18.0),
[Messages](https://support.apple.com/zh-cn/guide/iphone/iph82fb73ba3/18.0/ios/18.0),
[Mail](https://support.apple.com/zh-cn/guide/iphone/iph742b6abb1/18.0/ios/18.0),
[Notes](https://support.apple.com/zh-cn/guide/iphone/iph1ac0b3a2/18.0/ios/18.0),
[Weather](https://support.apple.com/zh-cn/guide/iphone/iph1ac0b35f/18.0/ios/18.0),
[Clock](https://support.apple.com/zh-cn/guide/iphone/iph2909d3a74/18.0/ios/18.0),
[Contacts](https://support.apple.com/zh-cn/guide/iphone/iph9b90d0aba/18.0/ios/18.0),
[Phone](https://support.apple.com/zh-cn/guide/iphone/iph3c993cbc/18.0/ios/18.0).
