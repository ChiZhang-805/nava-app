import SwiftUI

enum NavaColor {
    static let ink = Color(red: 0.04, green: 0.17, blue: 0.23)
    static let secondaryInk = Color(red: 0.27, green: 0.42, blue: 0.48)
    static let accent = Color(red: 0.05, green: 0.52, blue: 0.66)
    static let mist = Color(red: 0.88, green: 0.96, blue: 0.98)
    static let frost = Color.white.opacity(0.86)
    static let divider = Color(red: 0.62, green: 0.78, blue: 0.82).opacity(0.42)
    static let warning = Color(red: 0.91, green: 0.37, blue: 0.35)
    static let reward = Color(red: 0.96, green: 0.62, blue: 0.09)
}

enum NavaMetric {
    static let pageInset: CGFloat = 20
    static let compactInset: CGFloat = 14
    static let cardRadius: CGFloat = 28
    static let controlRadius: CGFloat = 18
    static let minimumTap: CGFloat = 44
    static let sectionSpacing: CGFloat = 16
}

struct NavaSceneBackground: View {
    var imageName: String = "NavaHomeScene"

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.87, green: 0.95, blue: 0.98), Color(red: 0.67, green: 0.90, blue: 0.96)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(imageName)
                .resizable()
                .scaledToFill()
                .opacity(0.28)
            LinearGradient(
                colors: [.white.opacity(0.40), .clear, NavaColor.accent.opacity(0.08)],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct NavaCard<Content: View>: View {
    private let content: Content
    private let padding: CGFloat

    init(padding: CGFloat = NavaMetric.sectionSpacing, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: NavaMetric.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: NavaMetric.cardRadius, style: .continuous)
                    .stroke(.white.opacity(0.76), lineWidth: 1)
            }
    }
}

struct NavaPageHeader: View {
    let title: LocalizedStringKey
    var backAction: (() -> Void)?
    var menuAction: (() -> Void)?

    var body: some View {
        ZStack {
            Text(title)
                .font(.title2.weight(.bold))
                .foregroundStyle(NavaColor.ink)
                .lineLimit(1)

            HStack {
                if let backAction {
                    Button(action: backAction) {
                        Image(systemName: "chevron.left")
                            .font(.title3.weight(.semibold))
                            .frame(width: NavaMetric.minimumTap, height: NavaMetric.minimumTap)
                    }
                    .accessibilityLabel("返回")
                }
                Spacer()
                if let menuAction {
                    Button(action: menuAction) {
                        Image(systemName: "ellipsis")
                            .font(.title3.weight(.semibold))
                            .frame(width: NavaMetric.minimumTap, height: NavaMetric.minimumTap)
                    }
                    .accessibilityLabel("更多")
                }
            }
            .foregroundStyle(NavaColor.accent)
        }
        .frame(minHeight: 52)
    }
}

struct NavaSectionTitle: View {
    let icon: String
    let title: LocalizedStringKey

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title2.weight(.semibold))
                .foregroundStyle(NavaColor.accent)
                .frame(width: 30)
            Text(title)
                .font(.title2.weight(.bold))
                .foregroundStyle(NavaColor.ink)
            Spacer(minLength: 0)
        }
    }
}

struct NavaPrimaryButton: View {
    let title: LocalizedStringKey
    var icon: String?
    var isBusy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isBusy {
                    ProgressView().tint(.white)
                } else if let icon {
                    Image(systemName: icon)
                }
                Text(title).fontWeight(.semibold)
            }
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 54)
            .foregroundStyle(.white)
            .background(NavaColor.ink, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
    }
}

struct NavaMetricPill: View {
    let icon: String
    let tint: Color
    let value: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(tint)
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(NavaColor.ink)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(.thinMaterial, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.75), lineWidth: 1))
    }
}

struct NavaInputField: View {
    let title: LocalizedStringKey
    let prompt: LocalizedStringKey
    var isSecure = false
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NavaColor.ink)
            Group {
                if isSecure {
                    SecureField(prompt, text: $text)
                } else {
                    TextField(prompt, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .font(.body)
            .foregroundStyle(NavaColor.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 54)
            .background(Color.white.opacity(0.78), in: RoundedRectangle(cornerRadius: NavaMetric.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: NavaMetric.controlRadius, style: .continuous)
                    .stroke(NavaColor.accent.opacity(0.20), lineWidth: 1)
            }
        }
    }
}

struct NavaNoScrollPage<Content: View>: View {
    let background: String
    private let content: Content

    init(background: String = "NavaHomeScene", @ViewBuilder content: () -> Content) {
        self.background = background
        self.content = content()
    }

    var body: some View {
        ZStack {
            NavaSceneBackground(imageName: background)
            content
                .padding(.horizontal, NavaMetric.pageInset)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }
}

struct NavaScrollPage<Content: View>: View {
    let background: String
    private let content: Content

    init(background: String = "NavaHomeScene", @ViewBuilder content: () -> Content) {
        self.background = background
        self.content = content()
    }

    var body: some View {
        ZStack {
            NavaSceneBackground(imageName: background)
            ScrollView {
                content
                    .padding(.horizontal, NavaMetric.pageInset)
                    .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollIndicators(.hidden)
        }
    }
}

extension View {
    func navaNavigationStyle() -> some View {
        self
            .toolbarBackground(NavaColor.ink, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
            .toolbarColorScheme(.dark, for: .tabBar)
            .tint(NavaColor.accent)
    }
}
