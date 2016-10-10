Important - this is a custom build of `mapbox-gl-js`.  It includes two changes:

  - support for DDS `text-rotate` property
  - fixed-precision formatting for floating point tile properties

Without these features, turn value labels either won't appear, or will have poorly
formatted numeric precision (i.e. 0.100000000154 instead of 0.1).
