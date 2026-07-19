import Capacitor

final class NavaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(NavaHealthPlugin())
        bridge?.registerPluginInstance(NavaWatchBridgePlugin())
        bridge?.registerPluginInstance(NavaSpeechPlugin())
    }
}
