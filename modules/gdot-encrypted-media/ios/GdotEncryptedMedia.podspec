Pod::Spec.new do |s|
  s.name           = 'GdotEncryptedMedia'
  s.version        = '1.0.0'
  s.summary        = 'On-device streaming AEAD decrypt for .genc media'
  s.description    = 'AVAssetResourceLoaderDelegate chunk decryptor'
  s.license        = 'MIT'
  s.author         = 'gdot'
  s.homepage       = 'https://github.com/local/gdot-encrypted-media'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
