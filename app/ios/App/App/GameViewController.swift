import UIKit
import Capacitor

/// The game's web view, full screen: no status bar, the home indicator fades
/// out while playing, and edge swipes reach the game before the system.
class GameViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    /// Where the web view was scrolled before the keyboard opened.
    private var offsetBeforeKeyboard: CGPoint?

    override func viewDidLoad() {
        super.viewDidLoad()
        // The keyboard scrolls the web view to show the focused text box and
        // WebKit doesn't always scroll it back, which leaves the game drawn
        // offset (a black band at the top) while taps land on the old spots.
        // Put the view back where it was once the keyboard has closed.
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow),
                           name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardDidHide),
                           name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    @objc private func keyboardWillShow() {
        guard offsetBeforeKeyboard == nil, let scroll = webView?.scrollView else { return }
        offsetBeforeKeyboard = scroll.contentOffset
    }

    @objc private func keyboardDidHide() {
        guard let scroll = webView?.scrollView else { return }
        let target = offsetBeforeKeyboard ?? CGPoint(x: -scroll.adjustedContentInset.left, y: -scroll.adjustedContentInset.top)
        offsetBeforeKeyboard = nil
        if scroll.contentOffset != target {
            scroll.setContentOffset(target, animated: false)
        }
    }
}
