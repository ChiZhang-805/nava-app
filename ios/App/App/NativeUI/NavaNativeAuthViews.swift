import SwiftUI

struct NavaNativeSignInView: View {
    @State private var identity = ""
    @State private var password = ""
    @State private var isSubmitting = false
    let onSubmit: (String, String) async -> Void

    var body: some View {
        NavaNoScrollPage(background: "NavaAuthTexture") {
            GeometryReader { proxy in
                VStack(spacing: proxy.size.height < 690 ? 14 : 20) {
                    Spacer(minLength: 8)
                    Text("NAVA")
                        .font(.system(size: min(76, proxy.size.width * 0.20), weight: .bold, design: .serif))
                        .foregroundStyle(NavaColor.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("健康节律助手")
                        .font(.headline)
                        .foregroundStyle(NavaColor.secondaryInk)
                    Spacer(minLength: 12)
                    NavaCard {
                        VStack(spacing: 16) {
                            NavaInputField(title: "邮箱 / 手机号", prompt: "输入邮箱或手机号", text: $identity)
                            NavaInputField(title: "密码", prompt: "至少 6 位", isSecure: true, text: $password)
                            NavaPrimaryButton(title: "进入 NAVA", icon: "arrow.right", isBusy: isSubmitting) {
                                isSubmitting = true
                                Task {
                                    await onSubmit(identity, password)
                                    isSubmitting = false
                                }
                            }
                            HStack {
                                Button("忘记密码") { }
                                Spacer()
                                Button("创建账号") { }
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NavaColor.accent)
                            .frame(minHeight: NavaMetric.minimumTap)
                        }
                    }
                    Spacer(minLength: 8)
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
    }
}

struct NavaNativeOnboardingView: View {
    let onContinue: () -> Void

    var body: some View {
        NavaNoScrollPage {
            GeometryReader { proxy in
                VStack(spacing: 18) {
                    Image("NavaMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: proxy.size.height * 0.43)
                    VStack(spacing: 10) {
                        Text("和 NAVA 一起，读懂自己的节律")
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(NavaColor.ink)
                            .multilineTextAlignment(.center)
                        Text("从记录到回顾，所有健康信息都由你确认后保存。")
                            .font(.body)
                            .foregroundStyle(NavaColor.secondaryInk)
                            .multilineTextAlignment(.center)
                    }
                    Spacer(minLength: 0)
                    NavaPrimaryButton(title: "开始", icon: "arrow.right", action: onContinue)
                }
                .padding(.vertical, 18)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
    }
}
