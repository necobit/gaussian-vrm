BLE MIDI を受信して、アバターをブラウザ内で動かす。
BLE MIDI が送信されるデバイス名は"KANTAN-Play"

起動したらまず samples の中からアバターを Vocal,Guitar,Bass,Drum パートの 3 つを選ぶ。
同じアバターでも違うアバターでも良い。
最初はステージの背景にボーカルだけが表示されている。モーションは Idle。

- ch1 に MIDI Note on がきたら Guitar のアバターが表示される。
- ch4 に MIDI Note on がきたら Bass のアバターが表示される。
- ch10 に MIDI Note on がきたら Drum のアバターが表示される。

どれかのモーションが始まったら Vocal のモーションを Singing.fbx にする。
Vocal 以外は 1 秒以上 MIDI Note on が入力されなかったらアバターを消す。

--------ひとまずここまで実装-------

Guitar,Bass:143 フレームで 16 ステップ
Drum:141 フレームで 16 ステップ
ステップ数をフレームで割って、MIDI ノートと動きを同期させる。
