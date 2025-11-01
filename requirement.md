BLE MIDI を受信して、アバターをブラウザ内で動かす。
BLE MIDI が送信されるデバイス名は"KANTAN-Play"

起動したらまず samples の中からアバターを Vocal,Guitar,Bass,Drum パートの 3 つを選ぶ。
同じアバターでも違うアバターでも良い。
最初はステージの背景にボーカルだけが表示されている。モーションは Idle。

- ch1 に MIDI Note on がきたら Guitar のアバターが表示される。
- ch4 に MIDI Note on がきたら Bass のアバターが表示される。
- ch10 に MIDI Note on がきたら Drum のアバターが表示される。

--------ひとまずここまで実装-------
